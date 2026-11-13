//! The digital "Climate Champion" badge, generated as an SVG string on the fly.

/// Build the personalized badge.
///
/// * `name`    - the Eco Ranger's display name (already sanitized by the caller)
/// * `plastics`- number of plastic items they segregated
/// * `date`    - issue date, e.g. "13 Nov 2026"
/// * `code`    - official-looking code, e.g. "ER-2026-0042"
pub fn badge_svg(name: &str, plastics: u64, date: &str, code: &str) -> String {
    let display_name = xml_escape(&truncate(name, 15));
    let footer = xml_escape(&truncate(&format!("{} \u{2022} {}", date, code), 34));

    // 28 small circles around the rim give the seal its scalloped edge.
    let mut scallops = String::new();
    for i in 0..28 {
        let angle = (i as f64) / 28.0 * std::f64::consts::TAU;
        let x = 210.0 + 176.0 * angle.cos();
        let y = 210.0 + 176.0 * angle.sin();
        scallops.push_str(&format!(
            r##"<circle cx="{:.1}" cy="{:.1}" r="9" fill="#F9A825"/>"##,
            x, y
        ));
    }

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="420" height="540" viewBox="0 0 420 540" role="img" aria-label="Eco Rangers Climate Champion badge for {aria_name}">
  <defs>
    <radialGradient id="gold" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#FFE082"/>
      <stop offset="55%" stop-color="#FFC107"/>
      <stop offset="100%" stop-color="#F9A825"/>
    </radialGradient>
    <path id="arcTop" d="M 95 210 A 115 115 0 0 1 325 210" fill="none"/>
    <path id="arcBottom" d="M 100 250 A 115 115 0 0 0 320 250" fill="none"/>
  </defs>

  <!-- ribbon tails tucked behind the seal -->
  <polygon points="150,360 118,505 160,494 180,520 205,392" fill="#1B5E20"/>
  <polygon points="270,360 302,505 260,494 240,520 215,392" fill="#1B5E20"/>

  <!-- scalloped gold seal -->
  {scallops}
  <circle cx="210" cy="210" r="172" fill="url(#gold)" stroke="#F57F17" stroke-width="3"/>
  <circle cx="210" cy="210" r="150" fill="#1B5E20"/>
  <circle cx="210" cy="210" r="140" fill="none" stroke="#FFF8E1" stroke-width="3" stroke-dasharray="1 8" stroke-linecap="round"/>

  <!-- curved titles -->
  <text font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="22" font-weight="bold" fill="#F9A825" letter-spacing="3">
    <textPath href="#arcTop" xlink:href="#arcTop" startOffset="50%" text-anchor="middle">★ ECO RANGERS ★</textPath>
  </text>
  <text font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="13" font-weight="bold" fill="#FFF8E1" letter-spacing="1">
    <textPath href="#arcBottom" xlink:href="#arcBottom" startOffset="50%" text-anchor="middle">{footer}</textPath>
  </text>

  <!-- leaf emblem -->
  <path d="M210 112 C 194 121, 185 136, 185 152 C 185 165, 196 172, 210 172 C 224 172, 235 165, 235 152 C 235 136, 226 121, 210 112 Z" fill="#8BC34A"/>
  <path d="M210 122 V 163" stroke="#1B5E20" stroke-width="2.5" stroke-linecap="round"/>

  <!-- centre block -->
  <text x="210" y="197" text-anchor="middle" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="23" font-weight="bold" fill="#FFF8E1">{display_name}</text>
  <text x="210" y="223" text-anchor="middle" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="17" font-weight="bold" fill="#FFD54F" letter-spacing="1">CLIMATE CHAMPION</text>
  <text x="210" y="265" text-anchor="middle" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="42" font-weight="bold" fill="#FFF8E1">{plastics}</text>
  <text x="210" y="285" text-anchor="middle" font-family="Verdana, 'DejaVu Sans', sans-serif" font-size="11" letter-spacing="2" fill="#A5D6A7">PLASTIC ITEMS</text>
</svg>
"##,
        aria_name = xml_escape(name),
        scallops = scallops,
        display_name = display_name,
        footer = footer,
        plastics = plastics,
    )
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        let mut t: String = s.chars().take(max - 1).collect();
        t.push('\u{2026}');
        t
    } else {
        s.to_string()
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
