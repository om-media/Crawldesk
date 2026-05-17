//! Content audit commands for readability and page copy metrics.

use crate::core::storage::db;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentAuditPage {
    pub url_id: i64,
    pub url: String,
    pub title: Option<String>,
    pub status_code: Option<i64>,
    pub word_count: i64,
    pub sentence_count: i64,
    pub syllable_count: i64,
    pub avg_words_per_sentence: f64,
    pub flesch_reading_ease: f64,
    pub flesch_kincaid_grade: f64,
    pub reading_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentAuditResult {
    pub pages: Vec<ContentAuditPage>,
    pub total_pages: i64,
    pub average_reading_ease: f64,
    pub average_grade_level: f64,
    pub difficult_pages: i64,
    pub thin_pages: i64,
}

#[tauri::command]
pub fn audit_content(crawl_id: i64, limit: Option<i64>) -> Result<ContentAuditResult, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(250).clamp(1, 1000);
    let mut stmt = conn
        .prepare(
            "SELECT id, url, title, status_code, word_count, seo_data_json
             FROM urls
             WHERE crawl_id = ?1
               AND seo_data_json IS NOT NULL
               AND (content_type IS NULL OR content_type LIKE 'text/html%')
               AND (status_code IS NULL OR (status_code >= 200 AND status_code < 400))
             ORDER BY word_count ASC, id ASC
             LIMIT ?2",
        )
        .map_err(|e| format!("Failed to prepare content audit: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![crawl_id, limit], |row| {
            Ok((
                row.get::<_, i64>("id")?,
                row.get::<_, String>("url")?,
                row.get::<_, Option<String>>("title")?,
                row.get::<_, Option<i64>>("status_code")?,
                row.get::<_, Option<i64>>("word_count")?,
                row.get::<_, Option<String>>("seo_data_json")?,
            ))
        })
        .map_err(|e| format!("Failed to query content audit: {}", e))?;

    let mut pages = Vec::new();
    for row in rows.filter_map(|row| row.ok()) {
        let (url_id, url, title, status_code, stored_word_count, seo_data_json) = row;
        let text = extract_text(&seo_data_json);
        if text.trim().is_empty() {
            continue;
        }

        let metrics = readability_metrics(&text);
        pages.push(ContentAuditPage {
            url_id,
            url,
            title,
            status_code,
            word_count: stored_word_count.unwrap_or(metrics.word_count),
            sentence_count: metrics.sentence_count,
            syllable_count: metrics.syllable_count,
            avg_words_per_sentence: metrics.avg_words_per_sentence,
            flesch_reading_ease: metrics.flesch_reading_ease,
            flesch_kincaid_grade: metrics.flesch_kincaid_grade,
            reading_level: reading_level(metrics.flesch_reading_ease).to_string(),
        });
    }

    let total_pages = pages.len() as i64;
    let difficult_pages = pages
        .iter()
        .filter(|page| page.flesch_reading_ease < 50.0)
        .count() as i64;
    let thin_pages = pages.iter().filter(|page| page.word_count < 300).count() as i64;
    let average_reading_ease = average(pages.iter().map(|page| page.flesch_reading_ease));
    let average_grade_level = average(pages.iter().map(|page| page.flesch_kincaid_grade));

    Ok(ContentAuditResult {
        pages,
        total_pages,
        average_reading_ease,
        average_grade_level,
        difficult_pages,
        thin_pages,
    })
}

#[derive(Debug, Clone, Copy)]
struct ReadabilityMetrics {
    word_count: i64,
    sentence_count: i64,
    syllable_count: i64,
    avg_words_per_sentence: f64,
    flesch_reading_ease: f64,
    flesch_kincaid_grade: f64,
}

fn readability_metrics(text: &str) -> ReadabilityMetrics {
    let words = words(text);
    let word_count = words.len().max(1) as i64;
    let sentence_count = count_sentences(text).max(1) as i64;
    let syllable_count = words.iter().map(|word| count_syllables(word)).sum::<i64>().max(1);
    let avg_words_per_sentence = word_count as f64 / sentence_count as f64;
    let syllables_per_word = syllable_count as f64 / word_count as f64;
    let flesch_reading_ease =
        206.835 - (1.015 * avg_words_per_sentence) - (84.6 * syllables_per_word);
    let flesch_kincaid_grade =
        (0.39 * avg_words_per_sentence) + (11.8 * syllables_per_word) - 15.59;

    ReadabilityMetrics {
        word_count,
        sentence_count,
        syllable_count,
        avg_words_per_sentence: round2(avg_words_per_sentence),
        flesch_reading_ease: round2(flesch_reading_ease),
        flesch_kincaid_grade: round2(flesch_kincaid_grade.max(0.0)),
    }
}

fn extract_text(seo_data_json: &Option<String>) -> String {
    let seo: Value = match seo_data_json {
        Some(json) => match serde_json::from_str(json) {
            Ok(value) => value,
            Err(_) => return String::new(),
        },
        None => return String::new(),
    };

    let mut parts = Vec::new();
    push_string_field(&seo, &["title"], &mut parts);
    push_string_field(&seo, &["h1Text", "h1_text", "h1"], &mut parts);
    push_string_field(&seo, &["metaDescription", "meta_description"], &mut parts);
    push_string_field(&seo, &["extractableText", "extractable_text"], &mut parts);
    push_string_or_array_field(&seo, &["headingsH2", "headings_h2"], &mut parts);
    push_string_or_array_field(&seo, &["headingsH3", "headings_h3"], &mut parts);

    parts.join(" ")
}

fn push_string_field(seo: &Value, keys: &[&str], parts: &mut Vec<String>) {
    for key in keys {
        if let Some(value) = seo.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
            return;
        }
    }
}

fn push_string_or_array_field(seo: &Value, keys: &[&str], parts: &mut Vec<String>) {
    for key in keys {
        let Some(value) = seo.get(*key) else {
            continue;
        };

        if let Some(text) = value.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
            return;
        }

        if let Some(items) = value.as_array() {
            for item in items {
                if let Some(text) = item.as_str() {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                }
            }
            return;
        }
    }
}

fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_ascii_alphabetic() && c != '\'')
        .filter_map(|part| {
            let word = part.trim_matches('\'').to_lowercase();
            if word.is_empty() {
                None
            } else {
                Some(word)
            }
        })
        .collect()
}

fn count_sentences(text: &str) -> usize {
    let count = text
        .split(|c| matches!(c, '.' | '!' | '?'))
        .filter(|part| !part.trim().is_empty())
        .count();

    if count == 0 && !text.trim().is_empty() {
        1
    } else {
        count
    }
}

fn count_syllables(word: &str) -> i64 {
    let word = word
        .trim_matches(|c: char| !c.is_ascii_alphabetic())
        .to_lowercase();
    if word.is_empty() {
        return 0;
    }
    if word.len() <= 3 {
        return 1;
    }

    let chars: Vec<char> = word.chars().collect();
    let mut count = 0;
    let mut previous_was_vowel = false;

    for ch in &chars {
        let is_vowel = matches!(ch, 'a' | 'e' | 'i' | 'o' | 'u' | 'y');
        if is_vowel && !previous_was_vowel {
            count += 1;
        }
        previous_was_vowel = is_vowel;
    }

    if word.ends_with('e') && count > 1 && !word.ends_with("le") {
        count -= 1;
    }

    count.max(1)
}

fn reading_level(score: f64) -> &'static str {
    if score >= 80.0 {
        "Easy"
    } else if score >= 60.0 {
        "Standard"
    } else if score >= 30.0 {
        "Difficult"
    } else {
        "Very difficult"
    }
}

fn average(values: impl Iterator<Item = f64>) -> f64 {
    let mut count = 0.0;
    let mut total = 0.0;
    for value in values {
        count += 1.0;
        total += value;
    }
    if count == 0.0 {
        0.0
    } else {
        round2(total / count)
    }
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn syllable_counter_handles_common_words() {
        assert_eq!(count_syllables("cat"), 1);
        assert_eq!(count_syllables("reading"), 2);
        assert_eq!(count_syllables("available"), 4);
    }

    #[test]
    fn readability_metrics_calculate_plain_language() {
        let metrics = readability_metrics(
            "The cat sat on the mat. The dog ran in the sun. The page is easy to read.",
        );

        assert_eq!(metrics.sentence_count, 3);
        assert!(metrics.flesch_reading_ease > 80.0);
        assert_eq!(reading_level(metrics.flesch_reading_ease), "Easy");
    }

    #[test]
    fn extract_text_accepts_crawler_json_shape() {
        let json = Some(
            r#"{
                "title": "Content Audit",
                "h1Text": "Readability",
                "metaDescription": "Plain copy metrics",
                "headingsH2": ["Depth", "Coverage"],
                "extractableText": "The page has body copy for analysis."
            }"#
            .to_string(),
        );

        let text = extract_text(&json);

        assert!(text.contains("Content Audit"));
        assert!(text.contains("Plain copy metrics"));
        assert!(text.contains("body copy"));
    }
}
