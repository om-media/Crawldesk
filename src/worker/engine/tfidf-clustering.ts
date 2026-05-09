// Feature 7.1 — Semantic Similarity & Content Clustering via TF-IDF + Cosine Similarity
// Lightweight alternative to ONNX embeddings; no external model downloads required.

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'because', 'as', 'until', 'while', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'also', 'if', 'into'
])

interface TfIdfDoc {
  url: string
  title?: string
  metaDescription?: string
  wordCount?: number
  tf: Map<string, number> // term frequency (normalized)
  vectorTerms: string[]   // sorted unique terms for consistent indexing
}

export interface ClusterMember {
  url: string
  score: number // cosine similarity to cluster centroid
}

export interface ContentCluster {
  id: number
  size: number
  representativeUrl: string
  members: ClusterMember[]
  keywords: string[] // top shared keywords in this cluster
}

/**
 * Compute TF-IDF vectors for all pages and cluster by cosine similarity.
 * Pages with cosine similarity >= threshold are grouped together.
 */
export function clusterBySimilarity(
  docs: Array<{ url: string; title?: string | null; metaDescription?: string | null }>,
  options: { minClusterSize?: number; similarityThreshold?: number; maxDocs?: number } = {}
): ContentCluster[] {
  const { minClusterSize = 2, similarityThreshold = 0.35, maxDocs = 5000 } = options

  // Limit to most relevant docs (those with meaningful text content)
  const filtered = docs
    .filter(d => d.title || d.metaDescription)
    .slice(0, maxDocs)

  if (filtered.length < minClusterSize) return []

  // Build document-term matrix using TF-IDF
  const docTfIdfs: TfIdfDoc[] = buildTfIdf(filtered)

  // Build global vocabulary
  const vocabSet = new Set<string>()
  for (const d of docTfIdfs) for (const t of d.vectorTerms) vocabSet.add(t)
  const vocab = [...vocabSet].sort()
  const termIndex = new Map(vocab.map((t, i) => [t, i]))
  const dim = vocab.length
  if (dim === 0) return []

  // Convert each doc's tf-idf map to a dense vector
  const vectors: Float64Array[] = docTfIdfs.map(d => {
    const v = new Float64Array(dim)
    for (const [term, val] of d.tf.entries()) {
      const idx = termIndex.get(term)
      if (idx !== undefined) v[idx] = val
    }
    return normalizeVector(v)
  })

  // Simple greedy clustering: compare each pair, group by threshold
  const clusterAssignments = new Map<number, number>() // doc index -> cluster id
  let clusterId = 0

  for (let i = 0; i < vectors.length; i++) {
    if (clusterAssignments.has(i)) continue
    clusterId++
    clusterAssignments.set(i, clusterId)
    const memberIndices: number[] = [i]

    for (let j = i + 1; j < vectors.length; j++) {
      if (clusterAssignments.has(j)) continue
      const sim = cosineSimilarity(vectors[i], vectors[j])
      if (sim >= similarityThreshold) {
        clusterAssignments.set(j, clusterId)
        memberIndices.push(j)
      }
    }

    if (memberIndices.length < minClusterSize) {
      // Too small — disband and reassign
      for (const m of memberIndices) clusterAssignments.delete(m)
      clusterId--
    }
  }

  // Build cluster results with proper score computation
  const clusters = new Map<number, ContentCluster>()
  const clusterDocIndices = new Map<number, number[]>()
  for (const [docIdx, cid] of clusterAssignments.entries()) {
    if (!clusterDocIndices.has(cid)) clusterDocIndices.set(cid, [])
    clusterDocIndices.get(cid)!.push(docIdx)
  }

  for (const [cid, indices] of clusterDocIndices.entries()) {
    const repIdx = indices[0]!
    const repVec = vectors[repIdx]!
    const members: ClusterMember[] = []
    for (const idx of indices) {
      const vec = vectors[idx]!
      const score = Math.round(cosineSimilarity(repVec, vec) * 1000) / 1000
      members.push({ url: docTfIdfs[idx]!.url, score })
    }
    members.sort((a, b) => b.score - a.score)
    const c: ContentCluster = {
      id: cid,
      size: members.length,
      representativeUrl: members[0]!.url,
      members,
      keywords: []
    }
    clusters.set(cid, c)

    // Extract top shared keywords per cluster
    const termScores = new Map<string, number>()
    for (const idx of indices) {
      for (const [term, val] of docTfIdfs[idx]!.tf.entries()) {
        termScores.set(term, (termScores.get(term) || 0) + val)
      }
    }
    c.keywords = [...termScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => e[0])
  }

  // Set representative URL and extract top shared keywords per cluster
  for (const [, c] of clusters) {
    c.representativeUrl = c.members[0]?.url || ''
    // Collect top terms across all members in this cluster
    const termScores = new Map<string, number>()
    for (const m of c.members) {
      const doc = docTfIdfs.find(d => d.url === m.url)
      if (!doc) continue
      for (const [term, val] of doc.tf.entries()) {
        termScores.set(term, (termScores.get(term) || 0) + val)
      }
    }
    c.keywords = [...termScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(e => e[0])
  }

  return [...clusters.values()].sort((a, b) => b.size - a.size)
}

function buildTfIdf(docs: Array<{ url: string; title?: string | null; metaDescription?: string | null }>): TfIdfDoc[] {
  // Tokenize each document
  const tokenized = docs.map(d => ({
    ...d,
    tokens: tokenize(`${d.title || ''} ${d.metaDescription || ''}`)
  }))

  // Compute IDF: log(N / df(t))
  const df = new Map<string, number>()
  for (const t of tokenized) {
    const uniqueTerms = new Set(t.tokens)
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) || 0) + 1)
    }
  }
  const N = tokenized.length
  const idf = new Map<string, number>()
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1) // smoothed IDF
  }

  // Build TF-IDF per doc
  return tokenized.map(d => {
    const tf = new Map<string, number>()
    let totalTerms = 0
    for (const token of d.tokens) {
      tf.set(token, (tf.get(token) || 0) + 1)
      totalTerms++
    }
    // Normalize TF by document length
    if (totalTerms > 0) {
      for (const [term, count] of tf.entries()) {
        tf.set(term, count / totalTerms)
      }
    }
    // Apply IDF weighting
    const vectorTerms: string[] = []
    for (const [term, freq] of tf.entries()) {
      const w = idf.get(term) || 0
      if (w > 0) {
        tf.set(term, freq * w)
        vectorTerms.push(term)
      }
    }
    vectorTerms.sort()
    return { url: d.url, title: d.title ?? undefined, metaDescription: d.metaDescription ?? undefined, tf, vectorTerms }
  })
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
}

function normalizeVector(v: Float64Array): Float64Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return new Float64Array(v.length)
  const out = new Float64Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

function cosineSimilarity(a: Float64Array, b: Float64Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // vectors are already normalized, so dot product = cosine similarity
}
