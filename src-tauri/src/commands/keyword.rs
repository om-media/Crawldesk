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

/// Extract text fields from seo_data_json for keyword analysis.
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

    // Fetch all URLs with seo_data_json for this crawl
    let mut stmt = conn
        .prepare(
            "SELECT id, seo_data_json FROM urls WHERE crawl_id = ?1 AND seo_data_json IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;

    // ngram -> count of occurrences across all pages
    let mut ngram_counts: HashMap<String, i64> = HashMap::new();

    let rows = stmt
        .query_map(rusqlite::params![crawl_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for row_result in rows.filter_map(|r| r.ok()) {
        let (_url_id, seo_json) = row_result;
        let text = extract_text(&seo_json);
        if text.is_empty() {
            continue;
        }

        let tokens = tokenize(&text);

        // Build n-grams and count them
        let ngrams = build_ngrams(&tokens, gram_size);
        for ng in ngrams {
            *ngram_counts.entry(ng).or_insert(0) += 1;
        }
    }

    // Calculate total words (sum of all token counts across all pages)
    let total_words: i64 = ngram_counts.values().sum();

    // Build result sorted by count desc, then alphabetically
    let mut keywords: Vec<KeywordFrequency> = ngram_counts
        .into_iter()
        .map(|(phrase, count)| {
            let frequency = if total_words > 0 {
                (count as f64) / (total_words as f64)
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

    Ok(KeywordAnalysisResult {
        keywords,
        total_words,
    })
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
}
