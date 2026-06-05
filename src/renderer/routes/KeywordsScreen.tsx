import { useState, useEffect, useMemo } from 'react'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'
import ErrorBanner from '../components/ErrorBanner'


type TabKey = 'unigrams' | 'bigrams' | 'trigrams'

interface KeywordEntry { phrase: string; count: number }

export default function KeywordsScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [activeTab, setActiveTab] = useState<TabKey>('unigrams')
  const [keywords, setKeywords] = useState<KeywordEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [totalWords, setTotalWords] = useState(0)
  const [totalPhrases, setTotalPhrases] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')

  const filteredKeywords = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return keywords
    return keywords.filter(keyword => keyword.phrase.toLowerCase().includes(query))
  }, [keywords, search])

  useEffect(() => { loadKeywords() }, [activeCrawlId, activeTab])

  async function loadKeywords() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.keywords.analyze(activeCrawlId, activeTab)
      const rows = result?.keywords || []
      setKeywords(rows)
      setTotalWords(result?.totalWords || 0)
      setTotalPhrases(result?.totalPhrases || rows.length)
    } catch (e: any) {
      console.error('[Keywords] Failed to load:', e)
      setKeywords([])
      setTotalWords(0)
      setTotalPhrases(0)
      setLoadError(e?.message || 'Failed to analyze keywords for this crawl.')
    }
    finally { setLoading(false) }
  }

  async function exportKeywords() {
    if (!activeCrawlId) return
    setLoadError(null)
    setExportStatus('')
    setExporting(true)
    try {
      const result = await window.crawldesk.exports.exportKeywords({
        crawlId: activeCrawlId,
        gramType: activeTab,
        filters: { search },
      })
      setExportStatus(`Exported ${result.rowCount} keywords to ${result.filePath}`)
    } catch (e: any) {
      console.error('[Keywords] Export failed:', e)
      setLoadError(e?.message || 'Failed to export keywords.')
    } finally {
      setExporting(false)
    }
  }

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">{resolvingCrawl ? 'Loading latest crawl...' : 'No keywords yet.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with keyword data.' : 'Start a crawl first to extract keywords.')}</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Keywords</h1>

      {loadError && <ErrorBanner message={loadError} onRetry={loadKeywords} />}
      {exportStatus && <div className="mb-4 text-sm text-emerald bg-emerald/10 border border-emerald/30 rounded-sm px-3 py-2">{exportStatus}</div>}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
      <div className="kpi-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent">Aa</span>
          <div>
            <p className="text-xs text-primary-muted uppercase">Total Words Analyzed</p>
            <p className="text-2xl font-bold text-primary-text">{totalWords.toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent">#</span>
          <div>
            <p className="text-xs text-primary-muted uppercase">Phrases In Current Tab</p>
            <p className="text-2xl font-bold text-primary-text">{totalPhrases.toLocaleString()}</p>
          </div>
        </div>
      </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-lumen pb-2">
        <div className="flex items-center gap-2">
          {(['unigrams', 'bigrams', 'trigrams'] as TabKey[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'bg-teal-bg border-x border-t border-lumen text-teal-accent' : 'text-primary-muted hover:text-primary-text'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Filter keywords..."
            className="input-field w-56!"
            type="text"
          />
          <button type="button" onClick={exportKeywords} disabled={exporting || loading || filteredKeywords.length === 0} className="btn-primary py-2! px-4! text-sm">
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <span className="text-xs text-primary-muted whitespace-nowrap">
            Showing {filteredKeywords.length.toLocaleString()} of {keywords.length.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div></div>
      ) : (
        keywords.length === 0 ? (
          <div className="bg-panel-dark border border-lumen rounded-lg py-10 text-center">
            <p className="text-primary-text">No keywords found for this crawl.</p>
            <p className="text-sm text-primary-muted mt-2">Only HTML pages with extracted text are included.</p>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <div className="bg-panel-dark border border-lumen rounded-lg py-10 text-center">
            <p className="text-primary-text">No keywords match this filter.</p>
            <p className="text-sm text-primary-muted mt-2">Try a broader phrase or switch n-gram tabs.</p>
          </div>
        ) : (
        <table className="w-full text-sm text-left border border-lumen rounded-lg bg-panel-dark overflow-hidden">
          <thead><tr className="border-b border-lumen">
            <th className="px-4 py-2 font-medium text-primary-muted w-16">#</th>
            <th className="px-4 py-2 font-medium text-primary-muted">Keyword Phrase</th>
            <th className="px-4 py-2 font-medium text-primary-muted w-24 text-right">Count</th>
          </tr></thead>
          <tbody>{filteredKeywords.map((k, i) => (
            <tr key={i} className="border-b border-lumen hover:bg-panel-dark">
              <td className="px-4 py-2 text-primary-muted">{i + 1}</td>
              <td className="px-4 py-2 text-primary-text">{k.phrase}</td>
              <td className="px-4 py-2 text-right text-primary-text font-mono">{k.count}</td>
            </tr>
          ))}</tbody>
        </table>
        )
      )}
    </div>
  )
}
