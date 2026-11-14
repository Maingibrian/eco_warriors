# Deploying to Netlify

The campaign site is plain static files — no build step, no Node, no Rust
required on the host. Netlify can serve it in minutes.

## What you get

| Feature | On Netlify | On the Rust server (`cargo run --release`) |
| --- | --- | --- |
| Cover + Challenge pages, poster, QR, styles | ✅ identical | ✅ identical |
| Logbook form → personalised badge + downloads | ✅ demo mode | ✅ live mode |
| Where reports are stored | this visitor's browser only (`localStorage`) | `data/reports.csv` + photos on the server |
| Community stats chips | this device's demo tally | real totals from all reports |
| Badge codes | `ER-<year>-<n>` per device | `ER-<year>-<n>` from the shared register |
| CSV export of all reports | — | ✅ |

In demo mode the form still validates the photo and count, mints a badge
with the ranger's name on it, counts the plastic items, and offers the
SVG/PNG downloads — all in the browser. It just can't collect reports
centrally, because a static host has no server-side storage.

## Deploy (Git-connected — recommended)

1. Push this repo to GitHub (already done: `Maingibrian/eco_warriors`).
2. In Netlify: **Add new site → Import an existing project → GitHub**,
   pick the `eco_warriors` repo.
3. Netlify reads `netlify.toml` and fills everything in:
   - Build command: none (echo placeholder)
   - Publish directory: `static`
4. Click **Deploy**. Your site is live at
   `https://<site-name>.netlify.app` within a minute or so.

Every push to `main` now redeploys automatically.

## Deploy (drag & drop — zero setup)

1. Download or clone this repo.
2. Go to <https://app.netlify.com/drop>.
3. Drag the **`static` folder** onto the page. Done — you get an instant
   `*.netlify.app` URL you can rename in Site settings.

## After the first deploy

- **Custom domain:** Site configuration → Domain management → add your
  domain and follow the DNS instructions.
- **Old links keep working:** `/login` and `/login.html` redirect to
  `/challenge#log-in` (same rule the Rust server uses), and `/challenge`
  serves `challenge.html` via Netlify's pretty URLs.
- **404s:** `static/404.html` is served for unknown paths.

## The QR code and your Netlify URL

The printed QR on the poster (and `static/img/qr-scan.png`) encodes the
campaign's preview URL. If Netlify becomes the campaign's real home,
regenerate it for your Netlify URL so phones land on the live site:

```bash
# in this repo's workspace (scripts/gen_qr_logo.py)
# edit PUBLIC_URL to https://<site-name>.netlify.app/ and run it,
# then commit the new static/img/qr-scan.png
```

## Later: switching the form to live mode

The form posts to `/api/report` on its own origin. To keep Netlify for
pages but collect reports centrally, run the Rust server (`cargo run
--release`, see README.md) at the domain root — it serves these same
static files *and* the API. Pointing the Netlify-hosted form at a
separate API host would need a small change (an API base URL in
`static/js/app.js` plus CORS headers) — not needed if the Rust server
serves everything itself.

## Quick local check (exactly what Netlify serves)

```bash
cd static
python3 -m http.server 3001
# open http://localhost:3001/ — pages, poster, QR, demo-mode form
```
