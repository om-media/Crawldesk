import { useEffect, useMemo, useState } from 'react'
import ErrorBanner from '../components/ErrorBanner'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'
import type { IssueRecord, IssueSummary } from '@shared/types/issue'

const SITEMAP_ISSUE_TYPES = [
  'sitemap_url_not_crawled',
  'crawled_url_missing_from_sitemap',
  'sitemap_url_error_status',
] as const

type SitemapIssueType = typeof SITEMAP_ISSUE_TYPES[number]

const SITEMAP_LABELS: Record<SitemapIssueType, string> = {
  sitemap_url_not_crawled: 'Sitemap URLs Not Crawled',
  crawled_url_missing_from_sitemap: 'Crawled URLs Missing From Sitemap',
  sitemap_url_error_status: 'Sitemap URLs With Error Status',
}

interface UrlSummary {
  totalUrls: number
  indexableUrls: number
  nonIndexableUrls: number
  errorUrls: number
}

export default function SitemapsScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [urlSummary, setUrlSummary] = useState<UrlSummary | null>(null)
  const [issueSummary, setIssueSummary] = useState<IssueSummary[]>([])
  const [selectedType, setSelectedType] = useState<SitemapIssueType>('sitemap_url_not_crawled')
  const [affectedUrls, setAffectedUrls] = useState<IssueRecord[]>([])
  const [affectedTotal, setAffectedTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [affectedLoading, setAffectedLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadOverview()
  }, [activeCrawlId])

  useEffect(() => {
    loadAffectedUrls(selectedType)
  }, [activeCrawlId, selectedType])

  async function loadOverview() {
    if (!activeCrawlId) return
    setLoading(true)
    setError(null)
    try {
      const [urls, issues] = await Promise.all([
        window.crawldesk.urls.summarize(activeCrawlId),
        window.crawldesk.issues.summarize(activeCrawlId),
      ])
      setUrlSummary(normalizeUrlSummary(urls))
      setIssueSummary((issues || []).filter((issue: IssueSummary) => isSitemapIssue(issue.issue_type)))
    } catch (e: any) {
      setError(e?.message || 'Failed to load sitemap coverage data.')
      setUrlSummary(null)
      setIssueSummary([])
      setAffectedUrls([])
      setAffectedTotal(0)
    } finally {
      setLoading(false)
    }
  }

  async function loadAffectedUrls(issueType: SitemapIssueType) {
    if (!activeCrawlId) return
    setAffectedLoading(true)
    try {
      const result = await window.crawldesk.issues.list({
        crawlId: activeCrawlId,
        page: 0,
        pageSize: 100,
        filters: { issueType },
      })
      setAffectedUrls(result.items || [])
      setAffectedTotal(result.total || 0)
    } catch (e) {
      console.error('[Sitemaps] Failed to load affected URLs:', e)
      setAffectedUrls([])
      setAffectedTotal(0)
    } finally {
      setAffectedLoading(false)
    }
  }

  const issueCounts = useMemo(() => {
    return Object.fromEntries(
      SITEMAP_ISSUE_TYPES.map((type) => [
        type,
        issueSummary.find((issue) => issue.issue_type === type)?.count || 0,
      ])
    ) as Record<SitemapIssueType, number>
  }, [issueSummary])

  const totalSitemapIssues = SITEMAP_ISSUE_TYPES.reduce((sum, type) => sum + issueCounts[type], 0)

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">{resolvingCrawl ? 'Loading latest crawl...' : 'No sitemap data yet.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with sitemap data.' : 'Run a crawl to compare crawled URLs against discovered sitemap URLs.')}</p>
    </div>
  )

  if (error) return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Sitemap Coverage</h1>
      <ErrorBanner message={error} onRetry={loadOverview} />
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none">Sitemap Coverage</h1>
          <p className="mt-2 text-sm text-primary-muted">
            Compare discovered sitemap URLs with what the crawl actually reached and indexed.
          </p>
        </div>
        <button type="button" onClick={loadOverview} className="btn-secondary text-sm" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard label="Crawled URLs" value={urlSummary?.totalUrls ?? 0} />
        <MetricCard label="Indexable URLs" value={urlSummary?.indexableUrls ?? 0} />
        <MetricCard label="Non-indexable URLs" value={urlSummary?.nonIndexableUrls ?? 0} />
        <MetricCard label="Sitemap Issues" value={totalSitemapIssues} tone={totalSitemapIssues > 0 ? 'warning' : 'good'} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {SITEMAP_ISSUE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
            className={`kpi-card text-left transition-all ${selectedType === type ? 'ring-1 ring-teal-accent/70' : ''}`}
          >
            <p className="text-xs text-primary-muted uppercase">{SITEMAP_LABELS[type]}</p>
            <p className={`mt-2 text-[28px] font-bold leading-none ${issueCounts[type] > 0 ? 'text-amber-300' : 'text-green-400'}`}>
              {issueCounts[type]}
            </p>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-lumen px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-primary-text">{SITEMAP_LABELS[selectedType]}</h2>
            <p className="text-xs text-primary-muted">{affectedTotal} affected URLs</p>
          </div>
          {affectedLoading && <div className="animate-spin h-4 w-4 border border-teal-accent border-t-transparent rounded-full" />}
        </div>

        {affectedUrls.length === 0 && !affectedLoading ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-primary-text">No sitemap discrepancies found for this group.</p>
            <p className="mt-2 text-sm text-primary-muted">
              Sitemap comparison runs after the crawl when sitemap discovery finds sitemap URLs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lumen/50">
                  {['URL', 'Severity', 'Message'].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-primary-muted">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affectedUrls.map((issue) => (
                  <tr key={issue.id} className="border-b border-lumen/30 hover:bg-midnight/30 transition-colors">
                    <td className="max-w-[520px] px-4 py-2 font-mono text-xs text-teal-text break-all">{issue.url}</td>
                    <td className="px-4 py-2">
                      <span className={issue.severity === 'critical' ? 'pill-error' : issue.severity === 'warning' ? 'pill-warning' : 'pill-neutral'}>
                        {issue.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-primary-muted">{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function isSitemapIssue(issueType: string): issueType is SitemapIssueType {
  return (SITEMAP_ISSUE_TYPES as readonly string[]).includes(issueType)
}

function normalizeUrlSummary(summary: any): UrlSummary {
  const totalUrls = Number(summary?.totalUrls ?? summary?.total_urls ?? summary?.total ?? 0)
  const indexableUrls = Number(summary?.indexableUrls ?? summary?.indexable_urls ?? summary?.indexableCount ?? summary?.indexable ?? 0)
  const nonIndexableUrls = Number(summary?.nonIndexableUrls ?? summary?.non_indexable_urls ?? summary?.nonIndexableCount ?? summary?.noindex ?? Math.max(totalUrls - indexableUrls, 0))
  return {
    totalUrls,
    indexableUrls,
    nonIndexableUrls,
    errorUrls: Number(summary?.errorUrls ?? summary?.error_urls ?? summary?.errors ?? summary?.non_200_status ?? 0),
  }
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warning' }) {
  const valueClass = tone === 'good' ? 'text-green-400' : tone === 'warning' ? 'text-amber-300' : 'text-primary-text'
  return (
    <div className="kpi-card">
      <p className="text-xs text-primary-muted uppercase">{label}</p>
      <p className={`mt-2 text-[28px] font-bold leading-none ${valueClass}`}>{value.toLocaleString('en-US')}</p>
    </div>
  )
}
