# Eco Rangers · The 5-Day Recycling Challenge

A very simple, one-page website for the **Eco Rangers** recycling campaign,
made for young kids — big buttons, playful characters, friendly animations:

- **Segregation at the source. Behaviour change for good.**
- The 5-day challenge: **BUILD · PLACE · LABEL · CHECK · SNAP**
- Rangers take a photo of the bin they built, log how many plastic items they
  segregated, and instantly receive a personalised digital **Climate Champion badge**.

The backend is written in **Rust using the standard library only** — no frameworks,
no external crates, no database. The frontend is plain **HTML + CSS + JS** with
no build step.

> **Just want it online?** The `static/` folder deploys to **Netlify** as-is —
> see **[DEPLOY.md](DEPLOY.md)**. Without a server the form runs in demo mode
> (badges and counts happen in the visitor's browser); the Rust server below
> adds live report collection.

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
| `/` | GET | The whole campaign on one page (`static/index.html`): full-screen poster hero, five missions, the friends, board game corner, ranger log-in + badge |
| `/challenge` | GET | 302 → `/#missions` (one page now; old two-page links keep working) |
| `/login` | GET | 302 → `/#log-in` |
| `/img/…`, `/css/…`, `/js/…` | GET | Static assets served from `static/` (traversal-proof) |
| `/api/stats` | GET | Community totals: `{"ok":true,"rangers":N,"items":M}` |
| `/api/report` | POST | Receives `name`, `email`, `plastics`, `photo` (base64) + `photo_mime`. Saves the photo, appends the report, returns the badge URL and updated totals |
| `/api/badge?name=…&plastics=…` | GET | The personalised badge as an SVG image |

### Where the data goes

- `data/reports.csv` — one line per report: `timestamp,name,email,plastics,photo_file`
- `data/uploads/` — the bin photos

Nothing else is stored; there is no tracking of any kind.

### About “send the badge”

Per the challenge flow, the badge is *issued digitally*: the log-in section
offers the sample **Climate Champion badge as an immediate
SVG/PNG download**, and the server generates a unique, personalised SVG
(name, plastic count, date, official code such as `ER-2026-0042`) once a
report is sent — displayed on the page and downloadable as **SVG** or
**PNG**. If you later want the badge
emailed, plug an SMTP call into `api_report` in `src/web.rs` right after
`append_report(...)` succeeds — the email address is already validated and
stored.

## Project layout

```
eco-rangers/
├── Cargo.toml          # no dependencies, on purpose
├── src/
│   ├── main.rs         # TCP listener + per-connection threads
│   ├── http.rs         # tiny HTTP/1.1 parser/writer, form + base64 decoding
│   ├── web.rs          # routing, static files, API handlers
│   ├── badge.rs        # the Climate Champion badge (generated SVG, kid-sticker style)
│   └── store.rs        # reports CSV + photo storage, UTC date helpers
└── static/
    ├── index.html      # the ONE page: full-screen poster hero → five missions
    │                   #   → meet the friends → board game → log your win + badge
    ├── 404.html        # themed not-found page
    ├── css/styles.css  # kid edition: big type, bouncy animations (reduced-motion safe)
    ├── js/app.js       # stats + report + badge downloads + static-host demo mode
    └── img/            # poster hero, game logo, favicon, sample badge,
                        #   game cover, and the generated character artwork
                        #   (mascot, Binny, Snack Squad, Trash Busters, 5 day scenes)
```

## Content sources

All copy comes from the campaign material: the five day missions from the
*Eco Rangers Challenge Cards*, and the game flow from the *Eco Rangers Guide
Book*. The hero is the campaign poster, filling the whole first screen. The
character artwork (Ranger Kid, Binny, the Snack Squad, the Trash Busters and
the five day scenes) was generated in the poster's flat cartoon style so the
site feels like one drawn world. The logo is the right-looking variant from
the *Eco Rangers Game Logo* sheet.

## Build a release binary

```bash
cargo build --release
./target/release/eco-rangers
```
