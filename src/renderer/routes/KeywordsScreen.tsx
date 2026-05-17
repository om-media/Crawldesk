import { useState, useEffect } from 'react'
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

  useEffect(() => { loadKeywords() }, [activeCrawlId, activeTab])

  async function loadKeywords() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.keywords.analyze(activeCrawlId, activeTab)
      setKeywords(result?.keywords || [])
      setTotalWords(result?.totalWords || 0)
      setTotalPhrases(result?.totalPhrases || 0)
    } catch (e: any) {
      console.error('[Keywords] Failed to load:', e)
      setKeywords([])
      setTotalWords(0)
      setTotalPhrases(0)
      setLoadError(e?.message || 'Failed to analyze keywords for this crawl.')
    }
    finally { setLoading(false) }
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
      <div className="flex items-center gap-2 mb-4 border-b border-lumen pb-1">
        {(['unigrams', 'bigrams', 'trigrams'] as TabKey[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'bg-teal-bg border-x border-t border-lumen text-teal-accent' : 'text-primary-muted hover:text-primary-text'}`}>
            {tab}
          </button>
        ))}
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
        ) : (
        <table className="w-full text-sm text-left border border-lumen rounded-lg bg-panel-dark overflow-hidden">
          <thead><tr className="border-b border-lumen">
            <th className="px-4 py-2 font-medium text-primary-muted w-16">#</th>
            <th className="px-4 py-2 font-medium text-primary-muted">Keyword Phrase</th>
            <th className="px-4 py-2 font-medium text-primary-muted w-24 text-right">Count</th>
          </tr></thead>
          <tbody>{keywords.map((k, i) => (
            <tr key={i} className="border-b border-lumen hover:bg-[#0c1820]">
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
