//! Procedural headlines. The game stores a short window of template ids.
//! Korean sentences live in the UI catalog, not in a news archive.

use serde::{Deserialize, Serialize};

pub const WINDOW: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewsItem {
    pub id: i64,
    pub template: String,
    pub week: i64,
    pub company_id: String,
    pub company_ko: String,
    pub period: String,
    pub tone: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Alert {
    pub template: String,
    pub company_id: String,
    pub company_ko: String,
    pub deal_id: String,
}

pub fn push_news(window: &mut Vec<NewsItem>, item: NewsItem) {
    window.push(item);
    if window.len() > WINDOW {
        let drop_count = window.len() - WINDOW;
        window.drain(0..drop_count);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_window_drops_the_oldest_headline() {
        let mut window = Vec::new();
        for id in 0..20 {
            push_news(
                &mut window,
                NewsItem {
                    id,
                    template: "news.quarter".into(),
                    week: id,
                    company_id: String::new(),
                    company_ko: String::new(),
                    period: String::new(),
                    tone: "neutral".into(),
                },
            );
        }
        assert_eq!(window.len(), WINDOW);
        assert_eq!(window[0].id, 4);
        assert_eq!(window[WINDOW - 1].id, 19);
    }
}
