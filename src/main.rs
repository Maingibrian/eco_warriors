//! Eco Rangers server - a tiny three-page site (cover, challenge, log-in)
//! for the 5-Day Recycling Challenge. Standard library only: each request is
//! served on its own thread, and all state lives in files under `data/`.

mod badge;
mod http;
mod store;
mod web;

use std::net::{TcpListener, TcpStream};
use std::path::Path;

fn main() {
    let port: u16 = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(8000);

    if !Path::new("static/index.html").exists() {
        eprintln!("warning: run this binary from the project root (static/index.html not found)");
    }
    store::ensure_data_dir();

    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("cannot bind to port {port}: {e}");
            std::process::exit(1);
        }
    };
    println!("Eco Rangers camp is open on http://0.0.0.0:{port}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || handle_connection(stream));
            }
            Err(e) => eprintln!("accept error: {e}"),
        }
    }
}

fn handle_connection(mut stream: TcpStream) {
    let peer = stream
        .peer_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| "?".to_string());
    match http::read_request(&mut stream) {
        http::ReadOutcome::Request(req) => {
            let resp = web::handle(&req);
            println!(
                "[{}] {} {} {} -> {} ({} bytes)",
                store::utc_clock(store::now_secs()),
                peer,
                req.method,
                req.path,
                resp.status,
                resp.body.len()
            );
            http::write_response(&mut stream, &resp);
        }
        http::ReadOutcome::Bad(status) => {
            let resp = bad_request_response(status);
            http::write_response(&mut stream, &resp);
        }
        http::ReadOutcome::Closed => {}
    }
}

fn bad_request_response(status: u16) -> http::Response {
    http::Response::json(status, r#"{"ok":false,"error":"bad request"}"#.to_string())
}
