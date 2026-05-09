/**
 * Feature: Phase 6 — N-Gram Keyword Extraction Engine.
 * Extracts unigrams, bigrams, and trigrams from page text content.
 */

export interface KeywordEntry {
  phrase: string
  count: number
}

interface NgramResult {
  unigrams: KeywordEntry[]
  bigrams: KeywordEntry[]
  trigrams: KeywordEntry[]
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'this', 'that', 'these', 'those', 'it', 'its', 'i', 'me',
  'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'not', 'no', 'nor', 'so', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again',
  'all', 'also', 'am', 'any', 'as', 'because', 'before', 'between',
  'both', 'each', 'few', 'further', 'get', 'got', 'here', 'into',
  'more', 'most', 'other', 'out', 'over', 'own', 'same', 'some',
  'such', 'there', 'through', 'under', 'until', 'up', 'while',
])

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

export function extractNgrams(text: string, topN = 200): NgramResult {
  const tokens = tokenize(text)

  // Unigrams
  const uniCounts = new Map<string, number>()
  for (const t of tokens) {
    uniCounts.set(t, (uniCounts.get(t) ?? 0) + 1)
  }

  // Bigrams
  const biCounts = new Map<string, number>()
  for (let i = 0; i < tokens.length - 1; i++) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`
    biCounts.set(phrase, (biCounts.get(phrase) ?? 0) + 1)
  }

  // Trigrams
  const triCounts = new Map<string, number>()
  for (let i = 0; i < tokens.length - 2; i++) {
    const phrase = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`
    triCounts.set(phrase, (triCounts.get(phrase) ?? 0) + 1)
  }

  return {
    unigrams: sortByCount(uniCounts, topN),
    bigrams: sortByCount(biCounts, topN),
    trigrams: sortByCount(triCounts, topN),
  }
}

function sortByCount(map: Map<string, number>, topN: number): KeywordEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, count]) => ({ phrase, count }))
}
