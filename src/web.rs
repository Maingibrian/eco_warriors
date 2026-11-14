//! Routing and request handlers: static files + the three API endpoints.

use crate::badge;
use crate::http::{base64_decode, parse_form, url_encode, Request, Response};
use crate::store;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub fn handle(req: &Request) -> Response {
    // HEAD is answered like GET (headers only — `http` strips the body).
    let method = if req.method == "HEAD" { "GET" } else { req.method.as_str() };
    let rel = req.path.strip_prefix('/').unwrap_or(req.path.as_str());
    let mut resp = match (method, req.path.as_str()) {
        ("GET", "/") | ("GET", "/index.html") => {
            let mut r = static_file("index.html");
            // The page references asset URLs that change on deploy; keep it fresh.
            r.cache_control = "no-cache".to_string();
            r
        }
        // The whole campaign lives on ONE page now; old two-page links keep
        // working via redirects to the right section of that page.
        ("GET", "/challenge") | ("GET", "/challenge.html") => redirect("/#missions"),
        ("GET", "/login") | ("GET", "/login.html") => redirect("/#log-in"),
        ("GET", "/api/stats") => api_stats(),
        ("GET", "/api/badge") => api_badge(req),
        ("POST", "/api/report") => api_report(req),
        ("GET", _) => static_file(rel),
        ("POST", _) => error_json(405, "Method not allowed"),
        _ => error_json(405, "Method not allowed"),
    };
    resp.head = req.method == "HEAD";
    resp
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

/// 302 redirect (Location header, empty body).
fn redirect(to: &str) -> Response {
    let mut r = Response::new(302, "text/html; charset=utf-8", Vec::new());
    r.location = to.to_string();
    r
}

fn static_file(rel: &str) -> Response {
    let mut path = PathBuf::from("static");
    for seg in rel.split('/') {
        if seg.is_empty() {
            continue;
        }
        // Reject dotfiles and any traversal attempt, then serve from `static/`.
        if seg.starts_with('.') || seg.contains("..") || seg.contains('\\') {
            return not_found();
        }
        path.push(seg);
    }
    if path.is_dir() {
        path.push("index.html");
    }
    match std::fs::read(&path) {
        Ok(body) => Response::new(200, mime_of(&path), body).cached("public, max-age=3600"),
        Err(_) => not_found(),
    }
}

fn mime_of(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "json" => "application/json; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn not_found() -> Response {
    let body = r##"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>404 · Eco Rangers</title>
<style>body{font-family:Verdana,sans-serif;background:#F7F1E1;color:#1B5E20;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center}h1{font-size:64px;margin:0}a{color:#2E7D32}</style></head>
<body><main><h1>404</h1><p>This trail leads nowhere.</p><p><a href="/">Back to the Eco Rangers camp &#127807;</a></p></main></body></html>"##;
    Response::new(404, "text/html; charset=utf-8", body.as_bytes().to_vec())
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/// Community totals shown in the impact strip.
fn api_stats() -> Response {
    let (rangers, items) = store::stats();
    Response::json(
        200,
        format!(r#"{{"ok":true,"rangers":{},"items":{}}}"#, rangers, items),
    )
}

/// Personalized badge as a standalone SVG (so it can be linked or downloaded).
fn api_badge(req: &Request) -> Response {
    let name = req
        .query_param("name")
        .map(store::sanitize_name)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Eco Ranger".to_string());
    let plastics = req
        .query_param("plastics")
        .and_then(|p| p.parse::<u64>().ok())
        .unwrap_or(0)
        .min(1_000_000);
    let date = clean_param(req.query_param("date"), 24)
        .unwrap_or_else(|| store::utc_date(store::now_secs()));
    let code = clean_param(req.query_param("code"), 20).unwrap_or_else(|| default_code());
    let svg = badge::badge_svg(&name, plastics, &date, &code);
    Response::new(200, "image/svg+xml; charset=utf-8", svg.into_bytes()).cached("no-cache")
}

/// Receive a report: name, email, plastic count and an optional bin photo.
fn api_report(req: &Request) -> Response {
    let form: HashMap<String, String> = parse_form(&req.body);
    let get = |k: &str| form.get(k).cloned().unwrap_or_default();

    let name = store::sanitize_name(&get("name"));
    if name.is_empty() {
        return error_json(400, "Please tell us your Eco Ranger name.");
    }

    let email = store::sanitize_email(&get("email"));
    if !email.contains('@') || email.len() < 5 {
        return error_json(400, "Please enter a valid email address so we can send your badge.");
    }

    let plastics: u64 = match get("plastics").trim().parse() {
        Ok(n) if (1..=100_000).contains(&n) => n,
        _ => return error_json(400, "Enter how many plastic items you segregated (1-100,000)."),
    };

    // Optional photo proof (the web UI always requires one; the API is lenient).
    let mut photo_file = String::new();
    let photo_b64 = get("photo");
    if !photo_b64.is_empty() {
        let bytes = match base64_decode(&photo_b64) {
            Some(b) => b,
            None => return error_json(400, "The photo data could not be read. Please try again."),
        };
        if bytes.len() > 4 * 1024 * 1024 {
            return error_json(413, "That photo is too large - please use one under 4 MB.");
        }
        if !looks_like_image(&bytes) {
            return error_json(400, "That file does not look like an image.");
        }
        let ext = match get("photo_mime").as_str() {
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            _ => "png",
        };
        match store::save_photo(&bytes, ext, &store::now_secs().to_string(), &name) {
            Ok(f) => photo_file = f,
            Err(_) => return error_json(500, "Could not save the photo on the server."),
        }
    }

    let ranger_number = match store::append_report(&name, &email, plastics, &photo_file) {
        Ok(n) => n,
        Err(_) => return error_json(500, "Could not save your report. Please try again."),
    };

    let (rangers, items) = store::stats();
    let code = format!("ER-{}-{:04}", store::year_now(), ranger_number);
    let date = store::utc_date(store::now_secs());
    let badge_url = format!(
        "/api/badge?name={}&plastics={}&date={}&code={}",
        url_encode(&name),
        plastics,
        url_encode(&date),
        url_encode(&code)
    );
    let body = format!(
        r#"{{"ok":true,"name":"{}","plastics":{},"ranger_number":{},"code":"{}","badge_url":"{}","totals":{{"rangers":{},"items":{}}}}}"#,
        json_escape(&name),
        plastics,
        ranger_number,
        code,
        json_escape(&badge_url),
        rangers,
        items
    );
    Response::json(200, body)
}

fn default_code() -> String {
    let (rangers, _) = store::stats();
    format!("ER-{}-{:04}", store::year_now(), rangers + 1)
}

fn clean_param(raw: Option<&str>, max: usize) -> Option<String> {
    raw.map(|s| {
        s.chars()
            .filter(|c| !c.is_control() && *c != ',' && *c != ';' && *c != '<' && *c != '>')
            .take(max)
            .collect::<String>()
    })
    .filter(|s| !s.is_empty())
}

/// Magic-number check for the three formats the web UI can produce.
fn looks_like_image(b: &[u8]) -> bool {
    b.starts_with(&[0x89, b'P', b'N', b'G']) // PNG
        || b.starts_with(&[0xFF, 0xD8, 0xFF]) // JPEG
        || (b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP") // WebP
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

fn error_json(status: u16, msg: &str) -> Response {
    Response::json(
        status,
        format!(r#"{{"ok":false,"error":"{}"}}"#, json_escape(msg)),
    )
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}
