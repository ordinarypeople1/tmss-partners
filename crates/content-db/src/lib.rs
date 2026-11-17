//! Latest-quarter company cards.
//!
//! The map and the list read this table with `LIMIT` and `OFFSET`. Quarter
//! history stays in the generator's `quarters` table and is not selected here.
//! `rusqlite` is native-only. The web dev build fetches one precomputed page
//! instead of compiling this crate to wasm.

use rusqlite::{params, Connection};
use serde::Serialize;

pub const MAX_PAGE_SIZE: u32 = 50;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CompanyCard {
    pub id: String,
    pub legal_name_ko: String,
    pub sector_id: String,
    pub region_label_ko: String,
    pub complex_name_ko: String,
    pub lat: f64,
    pub lon: f64,
    pub founded_year: i64,
    pub employees: i64,
    pub period: String,
    pub revenue: i64,
    pub ebitda: i64,
    pub model_multiple_millis: i64,
    pub debt: i64,
    pub cash: i64,
}

pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS company_cards (
          id TEXT PRIMARY KEY,
          legal_name_ko TEXT NOT NULL,
          sector_id TEXT NOT NULL,
          region_label_ko TEXT NOT NULL,
          complex_name_ko TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          founded_year INTEGER NOT NULL,
          employees INTEGER NOT NULL,
          period TEXT NOT NULL,
          revenue INTEGER NOT NULL,
          ebitda INTEGER NOT NULL,
          model_multiple_millis INTEGER NOT NULL,
          debt INTEGER NOT NULL,
          cash INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_company_cards_sector ON company_cards(sector_id);
        ",
    )
}

pub fn insert_card(conn: &Connection, card: &CompanyCard) -> rusqlite::Result<()> {
    conn.execute(
        "
        INSERT INTO company_cards (
          id, legal_name_ko, sector_id, region_label_ko, complex_name_ko,
          lat, lon, founded_year, employees, period, revenue, ebitda,
          model_multiple_millis, debt, cash
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ",
        params![
            card.id,
            card.legal_name_ko,
            card.sector_id,
            card.region_label_ko,
            card.complex_name_ko,
            card.lat,
            card.lon,
            card.founded_year,
            card.employees,
            card.period,
            card.revenue,
            card.ebitda,
            card.model_multiple_millis,
            card.debt,
            card.cash,
        ],
    )?;
    Ok(())
}

pub fn list_company_cards(
    conn: &Connection,
    limit: u32,
    offset: u32,
) -> rusqlite::Result<Vec<CompanyCard>> {
    let limit = limit.min(MAX_PAGE_SIZE);
    let mut statement = conn.prepare(
        "
        SELECT id, legal_name_ko, sector_id, region_label_ko, complex_name_ko,
               lat, lon, founded_year, employees, period, revenue, ebitda,
               model_multiple_millis, debt, cash
        FROM company_cards
        ORDER BY id
        LIMIT ?1 OFFSET ?2
        ",
    )?;
    let rows = statement.query_map(params![limit, offset], |row| {
        Ok(CompanyCard {
            id: row.get(0)?,
            legal_name_ko: row.get(1)?,
            sector_id: row.get(2)?,
            region_label_ko: row.get(3)?,
            complex_name_ko: row.get(4)?,
            lat: row.get(5)?,
            lon: row.get(6)?,
            founded_year: row.get(7)?,
            employees: row.get(8)?,
            period: row.get(9)?,
            revenue: row.get(10)?,
            ebitda: row.get(11)?,
            model_multiple_millis: row.get(12)?,
            debt: row.get(13)?,
            cash: row.get(14)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn card(index: usize) -> CompanyCard {
        CompanyCard {
            id: format!("co-{index:04}"),
            legal_name_ko: format!("회사 {index}"),
            sector_id: "food_manufacturing".to_string(),
            region_label_ko: "경기 서부".to_string(),
            complex_name_ko: "서부 단지".to_string(),
            lat: 37.0,
            lon: 126.8,
            founded_year: 2012,
            employees: 40,
            period: "2025Q4".to_string(),
            revenue: 1_000 + index as i64,
            ebitda: 100,
            model_multiple_millis: 7_200,
            debt: 50,
            cash: 10,
        }
    }

    fn filled(count: usize) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let tx = conn.unchecked_transaction().unwrap();
        for index in 0..count {
            insert_card(&tx, &card(index)).unwrap();
        }
        tx.commit().unwrap();
        conn
    }

    #[test]
    fn returns_one_page_and_skips_the_offset() {
        let conn = filled(200);
        let page = list_company_cards(&conn, 20, 40).unwrap();
        assert_eq!(page.len(), 20);
        assert_eq!(page[0].id, "co-0040");
        assert_eq!(page[19].id, "co-0059");
        assert!(page.iter().all(|row| row.period == "2025Q4"));
    }

    #[test]
    fn clamps_the_page_size() {
        let conn = filled(80);
        let page = list_company_cards(&conn, 10_000, 0).unwrap();
        assert_eq!(page.len(), MAX_PAGE_SIZE as usize);
    }

    #[test]
    fn page_of_one_thousand_reads_within_the_smoke_budget() {
        let conn = filled(1_000);
        let started = Instant::now();
        let page = list_company_cards(&conn, 20, 0).unwrap();
        assert_eq!(page.len(), 20);
        assert!(started.elapsed() < Duration::from_millis(500));
    }
}
