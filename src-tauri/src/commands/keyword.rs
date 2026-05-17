//! Keyword analysis commands — n-gram frequency analysis for crawled pages.
//!
//! Ports the TypeScript `analyzeKeywords` logic from urls.repo.ts into Rust.
//! Extracts text from seo_data_json of URLs in a crawl, filters stop words,
//! and counts unigrams/bigrams/trigrams.

use crate::core::storage::db;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ─── Return Types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordFrequency {
    pub phrase: String,
    pub count: i64,
    pub frequency: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordAnalysisResult {
    pub keywords: Vec<KeywordFrequency>,
    pub total_words: i64,
    pub total_phrases: i64,
}

// ─── Stop Words ────────────────────────────────────────────────────

fn stop_words() -> &'static [&'static str] {
    &[
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of",
        "on", "or", "that", "the", "this", "to", "with", "your", "i", "you", "he", "she", "we",
        "they", "me", "him", "her", "us", "them", "my", "his", "its", "our", "their", "what",
        "which", "who", "whom", "whose", "where", "when", "why", "how", "all", "each", "every",
        "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "because", "but", "if", "then", "while",
        "about", "against", "between", "into", "through", "during", "before", "after", "above",
        "below", "up", "down", "out", "off", "over", "under", "again", "further", "once", "here",
        "there", "also", "can", "will", "would", "could", "should", "may", "might", "shall", "do",
        "does", "did", "has", "have", "had", "being", "been", "am",
    ]
}

// ─── Tokenizer ─────────────────────────────────────────────────────

/// Tokenize text for keyword extraction: lowercase, strip non-alphanumeric,
/// filter stop words and short tokens.
fn tokenize(text: &str) -> Vec<String> {
    let sw = stop_words();
    text.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && !c.is_whitespace(), " ")
        .split_whitespace()
        .filter(|t| t.len() > 2 && !sw.contains(&t))
        .map(String::from)
        .collect()
}

// ─── N-gram Builder ────────────────────────────────────────────────

/// Build n-grams from a token list.
fn build_ngrams(tokens: &[String], n: usize) -> Vec<String> {
    if tokens.len() < n {
        return vec![];
    }
    (0..=tokens.len() - n)
        .map(|i| tokens[i..i + n].join(" "))
        .collect()
}

// ─── SEO Data Extraction ──────────────────────────────────────────

/// Extract text fields from normalized URL columns, with seo_data_json as a fallback.
fn extract_text_from_fields(
    title: &Option<String>,
    meta_description: &Option<String>,
    h1: &Option<String>,
    headings_h2: &Option<String>,
    headings_h3: &Option<String>,
    extractable_text: &Option<String>,
    seo_data_json: &Option<String>,
) -> String {
    let mut parts = Vec::new();
    let has_title = push_optional_text(title, &mut parts);
    let has_meta = push_optional_text(meta_description, &mut parts);
    let has_h1 = push_optional_text(h1, &mut parts);
    let has_h2 = push_optional_jsonish_text(headings_h2, &mut parts);
    let has_h3 = push_optional_jsonish_text(headings_h3, &mut parts);
    let has_extractable = push_optional_text(extractable_text, &mut parts);

    let seo: Value = match seo_data_json {
        Some(json) => match serde_json::from_str(json) {
            Ok(value) => value,
            Err(_) => return parts.join(" "),
        },
        None => return parts.join(" "),
    };

    if !has_title {
        push_string_field(&seo, &["title"], &mut parts);
    }
    if !has_h1 {
        push_string_field(&seo, &["h1Text", "h1_text", "h1"], &mut parts);
    }
    if !has_meta {
        push_string_field(&seo, &["metaDescription", "meta_description"], &mut parts);
    }
    if !has_extractable {
        push_string_field(&seo, &["extractableText", "extractable_text"], &mut parts);
    }
    if !has_h2 {
        push_string_or_array_field(&seo, &["headingsH2", "headings_h2"], &mut parts);
    }
    if !has_h3 {
        push_string_or_array_field(&seo, &["headingsH3", "headings_h3"], &mut parts);
    }

    parts.join(" ")
}

#[cfg(test)]
fn extract_text(seo_data_json: &Option<String>) -> String {
    extract_text_from_fields(
        &None,
        &None,
        &None,
        &None,
        &None,
        &None,
        seo_data_json,
    )
}

fn push_optional_text(value: &Option<String>, parts: &mut Vec<String>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    parts.push(trimmed.to_string());
    true
}

fn push_optional_jsonish_text(value: &Option<String>, parts: &mut Vec<String>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return false;
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        let before = parts.len();
        push_value_text(&parsed, parts);
        return parts.len() > before;
    }
    parts.push(trimmed.to_string());
    true
}

fn push_value_text(value: &Value, parts: &mut Vec<String>) {
    if let Some(text) = value.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            parts.push(trimmed.to_string());
        }
        return;
    }

    if let Some(items) = value.as_array() {
        for item in items {
            push_value_text(item, parts);
        }
    }
}

fn push_string_field(seo: &Value, keys: &[&str], parts: &mut Vec<String>) -> bool {
    for key in keys {
        if let Some(value) = seo.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
                return true;
            }
            return false;
        }
    }
    false
}

fn push_string_or_array_field(seo: &Value, keys: &[&str], parts: &mut Vec<String>) -> bool {
    for key in keys {
        let Some(value) = seo.get(*key) else {
            continue;
        };

        let before = parts.len();
        if let Some(text) = value.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                parts.push(trimmed.to_string());
            }
            return parts.len() > before;
        }

        if let Some(items) = value.as_array() {
            push_value_text(&Value::Array(items.clone()), parts);
            return parts.len() > before;
        }
    }
    false
}

// ─── Main Command ──────────────────────────────────────────────────

/// Analyze keywords for a crawl by extracting text from seo_data_json
/// of all URLs and counting n-gram frequencies.
///
/// The frontend expects: `{ keywords: [{ phrase, count }], totalWords }`
#[tauri::command]
pub fn analyze_keywords(
    crawl_id: i64,
    gram_type: String, // "unigrams", "bigrams", or "trigrams"
) -> Result<KeywordAnalysisResult, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    let gram_size = match gram_type.as_str() {
        "bigrams" => 2,
        "trigrams" => 3,
        _ => 1, // default to unigrams
    };

    // Fetch normalized text columns first; seo_data_json remains a fallback for older rows.
    let mut stmt = conn
        .prepare(
            "SELECT id, title, meta_description, h1, headings_h2, headings_h3, extractable_text, seo_data_json
             FROM urls
             WHERE crawl_id = ?1
               AND (
                 title IS NOT NULL OR meta_description IS NOT NULL OR h1 IS NOT NULL
                 OR headings_h2 IS NOT NULL OR headings_h3 IS NOT NULL
                 OR extractable_text IS NOT NULL OR seo_data_json IS NOT NULL
               )",
        )
        .map_err(|e| e.to_string())?;

    let mut texts = Vec::new();

    let rows = stmt
        .query_map(rusqlite::params![crawl_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row_result in rows.filter_map(|r| r.ok()) {
        let (_url_id, title, meta, h1, headings_h2, headings_h3, extractable, seo_json) =
            row_result;
        let text = extract_text_from_fields(
            &title,
            &meta,
            &h1,
            &headings_h2,
            &headings_h3,
            &extractable,
            &seo_json,
        );
        if text.is_empty() {
            continue;
        }
        texts.push(text);
    }

    Ok(analyze_keyword_texts(&texts, gram_size))
}

fn analyze_keyword_texts(texts: &[String], gram_size: usize) -> KeywordAnalysisResult {
    // ngram -> count of occurrences across all pages
    let mut ngram_counts: HashMap<String, i64> = HashMap::new();
    let mut total_words: i64 = 0;

    for text in texts {
        let tokens = tokenize(text);
        total_words += tokens.len() as i64;

        for ng in build_ngrams(&tokens, gram_size) {
            *ngram_counts.entry(ng).or_insert(0) += 1;
        }
    }

    let total_phrases: i64 = ngram_counts.values().sum();

    // Build result sorted by count desc, then alphabetically
    let mut keywords: Vec<KeywordFrequency> = ngram_counts
        .into_iter()
        .map(|(phrase, count)| {
            let frequency = if total_phrases > 0 {
                (count as f64) / (total_phrases as f64)
            } else {
                0.0
            };
            KeywordFrequency {
                phrase,
                count,
                frequency,
            }
        })
        .collect();

    // Sort by count descending, then alphabetically
    keywords.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.phrase.cmp(&b.phrase)));

    // Limit to top 250 results (matching TypeScript behavior)
    keywords.truncate(250);

    KeywordAnalysisResult {
        keywords,
        total_words,
        total_phrases,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_text_accepts_crawler_json_shape() {
        let json = Some(
            r#"{
                "title": "Fixture Home",
                "h1Text": "Crawler Fixture",
                "metaDescription": "SEO audit content analysis",
                "headingsH2": ["Primary Links", "Keyword Clusters"],
                "socialMetaOpenGraph": { "title": "ignored object" },
                "structuredDataJson": [{ "@type": "Article" }],
                "extractableText": "Fixture seo audit content analysis cluster topic repeated"
            }"#
            .to_string(),
        );

        let text = extract_text(&json);

        assert!(text.contains("Fixture Home"));
        assert!(text.contains("Crawler Fixture"));
        assert!(text.contains("Keyword Clusters"));
        assert!(text.contains("cluster topic repeated"));
    }

    #[test]
    fn extract_text_accepts_legacy_snake_case_shape() {
        let json = Some(
            r#"{
                "title": "Legacy Home",
                "h1_text": "Legacy Fixture",
                "meta_description": "Legacy meta copy",
                "headings_h2": "Legacy Heading",
                "extractable_text": "legacy extractable body"
            }"#
            .to_string(),
        );

        let text = extract_text(&json);

        assert!(text.contains("Legacy Home"));
        assert!(text.contains("Legacy Fixture"));
        assert!(text.contains("Legacy Heading"));
        assert!(text.contains("legacy extractable body"));
    }

    #[test]
    fn keyword_analysis_reports_words_separately_from_phrases() {
        let texts = vec!["alpha beta gamma alpha".to_string()];

        let result = analyze_keyword_texts(&texts, 2);

        assert_eq!(result.total_words, 4);
        assert_eq!(result.total_phrases, 3);
        assert!(result
            .keywords
            .iter()
            .any(|entry| entry.phrase == "alpha beta" && entry.count == 1));
    }

    #[test]
    fn extract_text_uses_normalized_columns_without_json() {
        let text = extract_text_from_fields(
            &Some("Column Title".to_string()),
            &Some("Column meta copy".to_string()),
            &Some("Column H1".to_string()),
            &Some(r#"["Column H2", "Second H2"]"#.to_string()),
            &Some("Column H3".to_string()),
            &Some("Column body text for keyword analysis".to_string()),
            &None,
        );

        assert!(text.contains("Column Title"));
        assert!(text.contains("Second H2"));
        assert!(text.contains("Column body text"));
    }
}
