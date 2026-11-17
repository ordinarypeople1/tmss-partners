//! Tauri 2 command entry. Pinned to Tauri 2.1 (Rust 1.77) so it matches the
//! bootstrap toolchain (rustc 1.83). This crate is its own workspace because
//! the dev image has no WebKit, and `cargo test` at the repo root must not
//! try to link it. The haptics plugin on the v2 branch requires Rust 1.90 and
//! is Android/iOS only, so it is not a dependency yet.

use std::path::Path;

use app_commands::{quote_company, ValueCard};
use content_db::CompanyCard;

#[tauri::command]
fn quote_company_cmd(
    ebitda: i64,
    multiple_millis: i64,
    debt: i64,
    cash: i64,
) -> Result<ValueCard, String> {
    quote_company(ebitda, multiple_millis, debt, cash).map_err(|err| err.to_string())
}

#[tauri::command]
fn list_company_cards(
    db_path: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<CompanyCard>, String> {
    app_commands::list_cards_from_path(Path::new(&db_path), limit, offset)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![quote_company_cmd, list_company_cards])
        .run(tauri::generate_context!())
        .expect("error while running Deal Atlas");
}
