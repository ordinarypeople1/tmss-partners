//! Functions a Tauri command calls. The UI does not reimplement them.

use std::path::Path;

use content_db::{list_company_cards, CompanyCard};
use rusqlite::Connection;
use serde::Serialize;
use sim_core::{enterprise_value, equity_value, SimError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ValueCard {
    pub enterprise_value: i64,
    pub equity_value: i64,
    pub net_debt: i64,
}

pub fn quote_company(
    ebitda: i64,
    multiple_millis: i64,
    debt: i64,
    cash: i64,
) -> Result<ValueCard, SimError> {
    let net_debt = debt.checked_sub(cash).ok_or(SimError::Overflow)?;
    Ok(ValueCard {
        enterprise_value: enterprise_value(ebitda, multiple_millis)?,
        equity_value: equity_value(ebitda, multiple_millis, net_debt)?,
        net_debt,
    })
}

pub fn list_cards(
    conn: &Connection,
    limit: u32,
    offset: u32,
) -> rusqlite::Result<Vec<CompanyCard>> {
    list_company_cards(conn, limit, offset)
}

pub fn list_cards_from_path(
    path: &Path,
    limit: u32,
    offset: u32,
) -> Result<Vec<CompanyCard>, String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    list_cards(&conn, limit, offset).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use content_db::{insert_card, migrate, CompanyCard};

    #[test]
    fn quotes_the_sample_food_company() {
        let quote = quote_company(2_549, 7_200, 10_839, 10_109).unwrap();
        assert_eq!(quote.enterprise_value, 18_353);
        assert_eq!(quote.net_debt, 730);
        assert_eq!(quote.equity_value, 17_623);
    }

    #[test]
    fn reads_a_page_from_a_file() {
        let path = std::env::temp_dir().join(format!("deal-atlas-cards-{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        migrate(&conn).unwrap();
        for index in 0..30 {
            insert_card(
                &conn,
                &CompanyCard {
                    id: format!("co-{index:04}"),
                    legal_name: "Fictional Co.".to_string(),
                    sector_id: "food_manufacturing".to_string(),
                    country: "US".to_string(),
                    admin1: "US-OH".to_string(),
                    site_name: "Park".to_string(),
                    lat: 40.0,
                    lon: -83.0,
                    founded_year: 2009,
                    employees: 10,
                    period: "2023Q4".to_string(),
                    revenue: 100,
                    ebitda: 10,
                    model_multiple_millis: 7_000,
                    debt: 1,
                    cash: 1,
                },
            )
            .unwrap();
        }
        drop(conn);
        let page = list_cards_from_path(&path, 20, 0).unwrap();
        assert_eq!(page.len(), 20);
        assert_eq!(page[0].id, "co-0000");
        let _ = std::fs::remove_file(&path);
    }
}
