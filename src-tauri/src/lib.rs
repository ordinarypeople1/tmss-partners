//! Tauri 2 command entry. This crate is its own workspace so that `cargo test`
//! at the repo root does not link WebKit. The haptics plugin is Android/iOS only
//! and not a dependency yet (Steam first, ADR 0006).

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
