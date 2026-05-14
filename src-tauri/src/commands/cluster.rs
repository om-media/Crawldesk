//! Content clustering commands — TF-IDF based semantic similarity clustering.
//!
//! Ports the TypeScript `clusterBySimilarity` logic from tfidf-clustering.ts
//! into Rust. Computes TF-IDF vectors for page text, then clusters by cosine
//! similarity threshold.

use crate::core::storage::{db, models};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// ─── Return Types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterMember {
    pub url_id: i64,
    pub url: String,
    pub score: f64, // cosine similarity to cluster representative (0..1)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentCluster {
    pub cluster_id: i64,
    pub url_ids: Vec<i64>,
    pub urls: Vec<String>,
    pub representative_url: String,
    pub size: i64,
    pub keywords: Vec<String>, // top shared keywords in this cluster
}

// ─── Stop Words ────────────────────────────────────────────────────

fn stop_words() -> &'static HashSet<&'static str> {
    static WORDS: std::sync::OnceLock<HashSet<&'static str>> = std::sync::OnceLock::new();
    WORDS.get_or_init(|| {
        [
            "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
            "by", "from", "is", "was", "are", "were", "be", "been", "being", "have", "has", "had",
            "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall",
            "can", "need", "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
            "i", "you", "he", "she", "we", "they", "what", "which", "who", "whom", "whose",
            "where", "when", "why", "how", "all", "each", "every", "both", "few", "more", "most",
            "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than",
            "too", "very", "just", "because", "as", "until", "while", "about", "against",
            "between", "into", "through", "during", "before", "after", "above", "below", "up",
            "down", "out", "off", "over", "under", "again", "further", "then", "once", "here",
            "there", "also", "if", "into",
        ]
        .into_iter()
        .collect()
    })
}

// ─── Tokenizer ─────────────────────────────────────────────────────

/// Tokenize text for TF-IDF: lowercase, strip non-alphanumeric, filter stop words.
fn tokenize(text: &str) -> Vec<String> {
    let sw = stop_words();
    text.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && !c.is_whitespace(), " ")
        .split_whitespace()
        .filter(|t| t.len() >= 2 && !sw.contains(t))
        .map(String::from)
        .collect()
}

// ─── TF-IDF Document ──────────────────────────────────────────────

/// A single document with its TF-IDF vector representation.
struct TfIdfDoc {
    url_id: i64,
    url: String,
    tf: HashMap<String, f64>, // term frequency (normalized)
}

// ─── Vector Math ───────────────────────────────────────────────────

/// L2 normalize a sparse vector (represented as HashMap).
fn normalize_vector(vec: &HashMap<String, f64>) -> HashMap<String, f64> {
    let mut norm_sq: f64 = 0.0;
    for &v in vec.values() {
        norm_sq += v * v;
    }
    let norm = norm_sq.sqrt();
    if norm == 0.0 {
        return HashMap::new();
    }
    vec.iter().map(|(k, v)| (k.clone(), v / norm)).collect()
}

/// Cosine similarity between two normalized sparse vectors.
fn cosine_similarity(a: &HashMap<String, f64>, b: &HashMap<String, f64>) -> f64 {
    // Since vectors are normalized, dot product = cosine similarity
    let mut dot = 0.0;
    // Iterate over the smaller map for efficiency
    let (outer, inner) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    for (k, va) in outer {
        if let Some(&vb) = inner.get(k) {
            dot += va * vb;
        }
    }
    dot
}

// ─── TF-IDF Builder ────────────────────────────────────────────────

/// Build TF-IDF vectors for a list of documents.
fn build_tfidf(docs: &[(i64, String, String)], // (url_id, url, text)
) -> Vec<TfIdfDoc> {
    let n = docs.len();
    if n == 0 {
        return vec![];
    }

    // Tokenize each document
    let tokenized: Vec<Vec<String>> = docs.iter().map(|(_, _, text)| tokenize(text)).collect();

    // Compute IDF: smoothed log(N / (df(t) + 1)) + 1
    // df(t) = number of documents containing term t
    let mut doc_freq: HashMap<String, i64> = HashMap::new();
    for tokens in &tokenized {
        let unique: HashSet<&str> = tokens.iter().map(|s| s.as_str()).collect();
        for term in unique {
            *doc_freq.entry(term.to_string()).or_insert(0) += 1;
        }
    }

    // Build TF-IDF per document
    tokenized
        .into_iter()
        .enumerate()
        .map(|(idx, tokens)| {
            let url_id = docs[idx].0;
            let url = docs[idx].1.clone();

            // Compute term frequency (normalized by document length)
            let mut tf: HashMap<String, f64> = HashMap::new();
            for token in &tokens {
                *tf.entry(token.clone()).or_insert(0.0) += 1.0;
            }
            let total_terms = tokens.len() as f64;
            if total_terms > 0.0 {
                for val in tf.values_mut() {
                    *val /= total_terms;
                }
            }

            // Apply IDF weighting
            for (term, freq) in &mut tf {
                let df = doc_freq.get(term.as_str()).copied().unwrap_or(0) as f64;
                let idf = ((n as f64 + 1.0) / (df + 1.0)).ln() + 1.0;
                *freq *= idf;
            }

            TfIdfDoc { url_id, url, tf }
        })
        .collect()
}

// ─── Main Command ──────────────────────────────────────────────────

/// Find content clusters for a crawl using TF-IDF cosine similarity.
///
/// Pages with cosine similarity >= threshold are grouped together.
/// Returns clusters sorted by size descending.
#[tauri::command]
pub fn find_clusters(crawl_id: i64) -> Result<Vec<ContentCluster>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    // Fetch all URLs with seo_data_json for this crawl
    let mut stmt = conn
        .prepare(
            "SELECT id, url, seo_data_json FROM urls WHERE crawl_id = ?1 AND seo_data_json IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;

    // Collect documents with extractable text
    let mut docs: Vec<(i64, String, String)> = vec![];

    let rows = stmt
        .query_map(rusqlite::params![crawl_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row_result in rows.filter_map(|r| r.ok()) {
        let (url_id, url, seo_json) = row_result;
        let text = extract_text(&seo_json);
        if text.trim().is_empty() {
            continue;
        }
        docs.push((url_id, url, text));
    }

    // Need at least 2 documents to form a cluster
    if docs.len() < 2 {
        return Ok(vec![]);
    }

    // Limit to most relevant docs (matching TypeScript: max 5000)
    let max_docs = 5000;
    if docs.len() > max_docs {
        docs.truncate(max_docs);
    }

    // Build TF-IDF vectors
    let tfidf_docs = build_tfidf(&docs);
    if tfidf_docs.is_empty() {
        return Ok(vec![]);
    }

    // Normalize each vector
    let normalized: Vec<HashMap<String, f64>> =
        tfidf_docs.iter().map(|d| normalize_vector(&d.tf)).collect();

    // Greedy clustering by cosine similarity
    let similarity_threshold = 0.35;
    let min_cluster_size = 2;

    let mut cluster_assignment: HashMap<usize, i64> = HashMap::new(); // doc_idx -> cluster_id
    let mut cluster_id_counter: i64 = 0;

    for i in 0..normalized.len() {
        if cluster_assignment.contains_key(&i) {
            continue;
        }

        cluster_id_counter += 1;
        let cid = cluster_id_counter;
        cluster_assignment.insert(i, cid);
        let mut member_indices: Vec<usize> = vec![i];

        for j in (i + 1)..normalized.len() {
            if cluster_assignment.contains_key(&j) {
                continue;
            }
            let sim = cosine_similarity(&normalized[i], &normalized[j]);
            if sim >= similarity_threshold {
                cluster_assignment.insert(j, cid);
                member_indices.push(j);
            }
        }

        // Too small — disband and reassign
        if member_indices.len() < min_cluster_size {
            for m in &member_indices {
                cluster_assignment.remove(m);
            }
            cluster_id_counter -= 1;
        }
    }

    // Group documents by cluster
    let mut cluster_members: HashMap<i64, Vec<usize>> = HashMap::new();
    for (doc_idx, cid) in &cluster_assignment {
        cluster_members.entry(*cid).or_default().push(*doc_idx);
    }

    // Build result clusters
    let mut clusters: Vec<ContentCluster> = vec![];

    for (cid, member_indices) in cluster_members {
        if member_indices.len() < min_cluster_size {
            continue;
        }

        // Representative is the first document in the cluster
        let rep_idx = member_indices[0];
        let rep_vec = &normalized[rep_idx];

        // Compute members with similarity scores
        let mut members: Vec<ClusterMember> = vec![];
        for &idx in &member_indices {
            let score = cosine_similarity(rep_vec, &normalized[idx]);
            let rounded_score = (score * 1000.0).round() / 1000.0;
            members.push(ClusterMember {
                url_id: tfidf_docs[idx].url_id,
                url: tfidf_docs[idx].url.clone(),
                score: rounded_score,
            });
        }

        // Sort members by score descending
        members.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Extract top shared keywords per cluster
        let mut term_scores: HashMap<String, f64> = HashMap::new();
        for &idx in &member_indices {
            for (term, val) in &tfidf_docs[idx].tf {
                *term_scores.entry(term.clone()).or_insert(0.0) += val;
            }
        }

        let mut top_keywords: Vec<(String, f64)> = term_scores.into_iter().collect();
        top_keywords.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let keywords: Vec<String> = top_keywords
            .into_iter()
            .take(10)
            .map(|(term, _)| term)
            .collect();

        let url_ids: Vec<i64> = members.iter().map(|m| m.url_id).collect();
        let urls: Vec<String> = members.iter().map(|m| m.url.clone()).collect();

        clusters.push(ContentCluster {
            cluster_id: cid,
            url_ids,
            urls,
            representative_url: members[0].url.clone(),
            size: members.len() as i64,
            keywords,
        });
    }

    // Sort clusters by size descending
    clusters.sort_by(|a, b| b.size.cmp(&a.size));

    Ok(clusters)
}

// ─── SEO Data Extraction ──────────────────────────────────────────

/// Extract text fields from seo_data_json for clustering.
fn extract_text(seo_data_json: &Option<String>) -> String {
    let seo: models::SeoData = match seo_data_json {
        Some(json) => match serde_json::from_str(json) {
            Ok(s) => s,
            Err(_) => return String::new(),
        },
        None => return String::new(),
    };

    let parts: Vec<String> = [
        seo.title,
        seo.h1_text,
        seo.meta_description,
        seo.extractable_text,
    ]
    .into_iter()
    .flatten()
    .collect();

    parts.join(" ")
}
