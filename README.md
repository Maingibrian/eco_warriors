# Eco Rangers · The 5-Day Recycling Challenge

A very simple, single-page website for the **Eco Rangers** recycling campaign:

- **Segregation at the source. Behaviour change for good.**
- The 5-day challenge: **BUILD · PLACE · LABEL · CHECK · SCAN**
- Rangers take a photo of the bin they built, log how many plastic items they
  segregated, and instantly receive a personalised digital **Climate Champion badge**.

The backend is written in **Rust using the standard library only** — no frameworks,
no external crates, no database. The frontend is plain **HTML + CSS + JS** with
no build step.

## Run it

```bash
cargo run
```

Then open <http://localhost:8000>. (Port can be changed with an argument:
`cargo run -- 3000`.)

> Run from the project root so the server can find `static/` and create `data/`.

## What the server does

| Route | Method | Description |
| --- | --- | --- |
| `/` | GET | Page 1 — the cover (`static/index.html`) |
| `/challenge` | GET | Page 2 — the 5-day challenge (`static/challenge.html`) |
| `/login` | GET | Page 3 — ranger log-in / report form (`static/login.html`) |
| `/img/…`, `/css/…`, `/js/…` | GET | Static assets served from `static/` (traversal-proof) |
| `/api/stats` | GET | Community totals: `{"ok":true,"rangers":N,"items":M}` |
| `/api/report` | POST | Receives `name`, `email`, `plastics`, `photo` (base64) + `photo_mime`. Saves the photo, appends the report, returns the badge URL and updated totals |
| `/api/badge?name=…&plastics=…` | GET | The personalised badge as an SVG image |

### Where the data goes

- `data/reports.csv` — one line per report: `timestamp,name,email,plastics,photo_file`
- `data/uploads/` — the bin photos

Nothing else is stored; there is no tracking of any kind.

### About “send the badge”

Per the challenge flow, the badge is *issued digitally*: the server generates a
unique, personalised SVG (name, plastic count, date, official code such as
`ER-2026-0042`), which the page displays and lets the user download as **SVG**
or **PNG**. If you later want the badge emailed, plug an SMTP call into
`api_report` in `src/web.rs` right after `append_report(...)` succeeds — the
email address is already validated and stored.

## Project layout

```
eco-rangers/
├── Cargo.toml          # no dependencies, on purpose
├── src/
│   ├── main.rs         # TCP listener + per-connection threads
│   ├── http.rs         # tiny HTTP/1.1 parser/writer, form + base64 decoding
│   ├── web.rs          # routing, static files, API handlers
│   ├── badge.rs        # the Climate Champion badge (generated SVG)
│   └── store.rs        # reports CSV + photo storage, UTC date helpers
└── static/
    ├── index.html      # page 1: the cover (poster + two doors)
    ├── challenge.html  # page 2: the 5-day challenge + board game corner
    ├── login.html      # page 3: ranger log-in (report form + badge)
    ├── css/styles.css
    ├── js/app.js       # shared by all three pages (element lookups optional)
    └── img/            # hero artwork, right-looking game logo,
                        # favicon, QR code, sample badge, game cover
```

## Content sources

All copy on the page comes from the campaign material: the five day missions
from the *Eco Rangers Challenge Cards*, the game flow and the 15 referee
questions from the *Eco Rangers Guide Book*, and the artwork (hero poster) from
the supplied PNG. The logo is the right-looking variant from the *Eco Rangers
Game Logo* sheet (page 1 — the ranger girl beside the wordmark), and the QR
code in the hero's green box points at the live site so a poster can be
scanned straight to the report form.

## Build a release binary

```bash
cargo build --release
./target/release/eco-rangers
```
