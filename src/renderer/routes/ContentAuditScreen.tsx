import { useEffect, useState } from 'react'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'
import ErrorBanner from '../components/ErrorBanner'

interface ContentAuditPage {
  urlId: number
  url: string
  title?: string | null
  statusCode?: number | null
  wordCount: number
  sentenceCount: number
  avgWordsPerSentence: number
  fleschReadingEase: number
  fleschKincaidGrade: number
  readingLevel: string
}

interface ContentAuditResult {
  pages: ContentAuditPage[]
  totalPages: number
  averageReadingEase: number
  averageGradeLevel: number
  difficultPages: number
  thinPages: number
}

function formatNumber(value: unknown, digits = 0) {
  const number = Number(value ?? 0)
  return number.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function scoreClass(score: number) {
  if (score >= 70) return 'text-emerald'
  if (score >= 50) return 'text-amber'
  return 'text-red-400'
}

export default function ContentAuditScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [audit, setAudit] = useState<ContentAuditResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => { loadAudit() }, [activeCrawlId])

  async function loadAudit() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.content.audit(activeCrawlId, 250)
      setAudit(result || null)
    } catch (e: any) {
      console.error('[Content] Failed to load audit:', e)
      setAudit(null)
      setLoadError(e?.message || 'Failed to load content audit for this crawl.')
    } finally {
      setLoading(false)
    }
  }

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">{resolvingCrawl ? 'Loading latest crawl...' : 'No content audit yet.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with page text.' : 'Start a crawl first to audit page copy.')}</p>
    </div>
  )

  const pages = audit?.pages || []

  return (
    <div>
      <h1 className="mb-6 text-[30px] font-bold leading-none tracking-tight text-primary-text">Content Audit</h1>

      {loadError && <ErrorBanner message={loadError} onRetry={loadAudit} />}

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="kpi-card">
          <p className="text-xs uppercase text-primary-muted">Pages Analyzed</p>
          <p className="mt-2 text-2xl font-bold text-primary-text">{formatNumber(audit?.totalPages)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs uppercase text-primary-muted">Avg Reading Ease</p>
          <p className={`mt-2 text-2xl font-bold ${scoreClass(Number(audit?.averageReadingEase ?? 0))}`}>{formatNumber(audit?.averageReadingEase, 1)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs uppercase text-primary-muted">Avg Grade Level</p>
          <p className="mt-2 text-2xl font-bold text-primary-text">{formatNumber(audit?.averageGradeLevel, 1)}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs uppercase text-primary-muted">Thin / Difficult</p>
          <p className="mt-2 text-2xl font-bold text-primary-text">{formatNumber(audit?.thinPages)} / {formatNumber(audit?.difficultPages)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-accent border-t-transparent"></div></div>
      ) : pages.length === 0 ? (
        <div className="rounded-lg border border-lumen bg-panel-dark py-10 text-center">
          <p className="text-primary-text">No readable HTML content found for this crawl.</p>
          <p className="mt-2 text-sm text-primary-muted">Only successful HTML pages with extracted text are included.</p>
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-lumen bg-panel-dark text-left text-sm">
          <thead>
            <tr className="border-b border-lumen">
              <th className="px-4 py-2 font-medium text-primary-muted">URL</th>
              <th className="w-24 px-4 py-2 text-right font-medium text-primary-muted">Words</th>
              <th className="w-28 px-4 py-2 text-right font-medium text-primary-muted">Sentences</th>
              <th className="w-28 px-4 py-2 text-right font-medium text-primary-muted">Ease</th>
              <th className="w-28 px-4 py-2 text-right font-medium text-primary-muted">Grade</th>
              <th className="w-36 px-4 py-2 font-medium text-primary-muted">Level</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(page => (
              <tr key={page.urlId} className="border-b border-lumen hover:bg-[#0c1820]">
                <td className="px-4 py-2">
                  <div className="max-w-[720px] truncate text-primary-text">{page.title || page.url}</div>
                  <div className="max-w-[720px] truncate text-xs text-primary-muted">{page.url}</div>
                </td>
                <td className="px-4 py-2 text-right font-mono text-primary-text">{formatNumber(page.wordCount)}</td>
                <td className="px-4 py-2 text-right font-mono text-primary-muted">{formatNumber(page.sentenceCount)}</td>
                <td className={`px-4 py-2 text-right font-mono ${scoreClass(Number(page.fleschReadingEase))}`}>{formatNumber(page.fleschReadingEase, 1)}</td>
                <td className="px-4 py-2 text-right font-mono text-primary-muted">{formatNumber(page.fleschKincaidGrade, 1)}</td>
                <td className="px-4 py-2 text-primary-text">{page.readingLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
