//! Persistence: reports live in a simple CSV file, photos in `data/uploads/`.
//!
//! The CSV is append-only, so no lock-file or database is needed; a mutex
//! serialises reads and writes, which is plenty for a small community site.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Serialises all reads/writes of the CSV store.
static STORE_LOCK: Mutex<()> = Mutex::new(());

pub fn uploads_dir() -> PathBuf {
    PathBuf::from("data").join("uploads")
}

/// Create the data directories at startup so first writes cannot race.
pub fn ensure_data_dir() {
    let _ = fs::create_dir_all(uploads_dir());
}

pub fn reports_path() -> PathBuf {
    PathBuf::from("data").join("reports.csv")
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// UTC date like "13 Nov 2026".
pub fn utc_date(epoch: u64) -> String {
    let (y, m, d) = civil_from_days((epoch / 86_400) as i64);
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    format!("{} {} {}", d, MONTHS[(m - 1) as usize], y)
}

/// UTC clock like "14:05:09", for request logs.
pub fn utc_clock(epoch: u64) -> String {
    let s = epoch % 86_400;
    format!("{:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60)
}

pub fn year_now() -> i64 {
    let (y, _, _) = civil_from_days((now_secs() / 86_400) as i64);
    y
}

/// Days-since-epoch to (year, month, day) — Howard Hinnant's civil_from_days.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Keep names CSV- and badge-safe: no control characters, commas or
/// semicolons; single spaces; 40 characters at most.
pub fn sanitize_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control() && *c != ',' && *c != ';')
        .collect();
    let cleaned = cleaned.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    cleaned.chars().take(40).collect()
}

pub fn sanitize_email(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !c.is_control() && !c.is_whitespace() && *c != ',')
        .collect();
    cleaned.chars().take(80).collect()
}

/// File-system-safe slug derived from a name, e.g. "amina-k" for photos.
pub fn slug(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() {
        "ranger".to_string()
    } else {
        s.chars().take(24).collect()
    }
}

/// Append one report; returns its 1-based ranger number.
pub fn append_report(name: &str, email: &str, plastics: u64, photo_file: &str) -> std::io::Result<u64> {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    fs::create_dir_all(uploads_dir())?;
    let new_line = format!("{},{},{},{},{}\n", now_secs(), name, email, plastics, photo_file);
    let mut file = OpenOptions::new().create(true).append(true).open(reports_path())?;
    file.write_all(new_line.as_bytes())?;
    let number = fs::read_to_string(reports_path())
        .map(|t| t.lines().filter(|l| !l.trim().is_empty()).count() as u64)
        .unwrap_or(1);
    Ok(number)
}

/// (rangers, plastic items) logged so far.
pub fn stats() -> (u64, u64) {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let mut rangers = 0u64;
    let mut items = 0u64;
    if let Ok(text) = fs::read_to_string(reports_path()) {
        for line in text.lines() {
            let cols: Vec<&str> = line.split(',').collect();
            if cols.len() >= 4 {
                rangers += 1;
                items += cols[3].trim().parse::<u64>().unwrap_or(0);
            }
        }
    }
    (rangers, items)
}

/// Persist a bin photo; returns the stored file name.
pub fn save_photo(bytes: &[u8], ext: &str, stamp: &str, name: &str) -> std::io::Result<String> {
    let _guard = STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    fs::create_dir_all(uploads_dir())?;
    let file_name = format!("{}_{}.{}", stamp, slug(name), ext);
    fs::write(uploads_dir().join(&file_name), bytes)?;
    Ok(file_name)
}
