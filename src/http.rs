//! Minimal HTTP/1.1 support built on the Rust standard library only.
//!
//! This is deliberately small: just enough to serve the static single page
//! and answer the three JSON endpoints the page needs.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::time::Duration;

/// Largest request body we accept (bin photos arrive base64-encoded).
pub const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_HEADER_BYTES: usize = 16 * 1024;

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: HashMap<String, String>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn query_param(&self, key: &str) -> Option<&str> {
        self.query.get(key).map(|s| s.as_str())
    }
}

pub enum ReadOutcome {
    Request(Box<Request>),
    /// The client closed the connection without sending anything.
    Closed,
    /// Malformed request; answer with this status code.
    Bad(u16),
}

/// Read one HTTP request from the stream.
pub fn read_request(stream: &mut TcpStream) -> ReadOutcome {
    if stream.set_read_timeout(Some(Duration::from_secs(15))).is_err() {
        return ReadOutcome::Closed;
    }
    let mut reader = match stream.try_clone() {
        Ok(clone) => BufReader::new(clone),
        Err(_) => return ReadOutcome::Closed,
    };

    // --- request line ---
    let mut line = String::new();
    match reader.read_line(&mut line) {
        Ok(0) => return ReadOutcome::Closed,
        Ok(_) => {}
        Err(_) => return ReadOutcome::Closed,
    }
    let mut parts = line.split_whitespace();
    let (method, target) = match (parts.next(), parts.next()) {
        (Some(m), Some(t)) if !m.is_empty() && !t.is_empty() => (m.to_string(), t.to_string()),
        _ => return ReadOutcome::Bad(400),
    };

    // --- headers ---
    let mut headers = HashMap::new();
    let mut header_bytes = 0usize;
    loop {
        let mut header_line = String::new();
        match reader.read_line(&mut header_line) {
            Ok(0) => return ReadOutcome::Closed,
            Ok(n) => {
                header_bytes += n;
                if header_bytes > MAX_HEADER_BYTES {
                    return ReadOutcome::Bad(431);
                }
            }
            Err(_) => return ReadOutcome::Closed,
        }
        let trimmed = header_line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    // --- path + query string ---
    let mut path = target.clone();
    let mut query = HashMap::new();
    if let Some((p, q)) = target.split_once('?') {
        path = p.to_string();
        for pair in q.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            query.insert(url_decode(key), url_decode(value));
        }
    }
    // Decode the path so the traversal check in the router sees real characters.
    let path = url_decode(&path);

    // --- body ---
    let mut body = Vec::new();
    if let Some(len) = headers.get("content-length") {
        let len: usize = match len.trim().parse() {
            Ok(l) => l,
            Err(_) => return ReadOutcome::Bad(400),
        };
        if len > MAX_BODY_BYTES {
            return ReadOutcome::Bad(413);
        }
        let mut take = reader.take(len as u64);
        if take.read_to_end(&mut body).unwrap_or(0) < len {
            return ReadOutcome::Bad(400);
        }
    }

    ReadOutcome::Request(Box::new(Request { method, path, query, body }))
}

pub struct Response {
    pub status: u16,
    pub content_type: String,
    pub cache_control: String,
    /// HEAD requests get the same headers as GET but no body.
    pub head: bool,
    pub body: Vec<u8>,
}

impl Response {
    pub fn new(status: u16, content_type: &str, body: Vec<u8>) -> Self {
        Response {
            status,
            content_type: content_type.to_string(),
            cache_control: "no-store".to_string(),
            head: false,
            body,
        }
    }

    pub fn json(status: u16, body: String) -> Self {
        Response::new(status, "application/json; charset=utf-8", body.into_bytes())
    }

    pub fn cached(mut self, policy: &str) -> Self {
        self.cache_control = policy.to_string();
        self
    }
}

pub fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        431 => "Request Header Fields Too Large",
        500 => "Internal Server Error",
        _ => "OK",
    }
}

/// Serialize and send a response, then close the connection.
pub fn write_response(stream: &mut TcpStream, resp: &Response) {
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: {}\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        resp.status,
        reason(resp.status),
        resp.content_type,
        resp.body.len(),
        resp.cache_control
    );
    let _ = stream.write_all(head.as_bytes());
    if !resp.head {
        let _ = stream.write_all(&resp.body);
    }
    let _ = stream.flush();
}

// ---------------------------------------------------------------------------
// Small encoding helpers
// ---------------------------------------------------------------------------

pub fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// Lenient percent-decoding (also maps '+' to space, as form bodies require).
pub fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => match (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                (Some(hi), Some(lo)) => {
                    out.push((hi << 4) | lo);
                    i += 3;
                }
                _ => {
                    out.push(bytes[i]);
                    i += 1;
                }
            },
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Parse an `application/x-www-form-urlencoded` body.
pub fn parse_form(body: &[u8]) -> HashMap<String, String> {
    let text = String::from_utf8_lossy(body);
    let mut map = HashMap::new();
    for pair in text.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        map.insert(url_decode(key), url_decode(value));
    }
    map
}

/// Standard-alphabet base64 decoder (input from `FileReader.readAsDataURL`).
pub fn base64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a') as u32 + 26),
            b'0'..=b'9' => Some((c - b'0') as u32 + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for &c in s.as_bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' || c == b' ' {
            continue;
        }
        acc = (acc << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}
