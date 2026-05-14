import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../stores/project-store'
import { useCrawlStore } from '../stores/crawl-store'

interface Props { onCompleted: () => void }

export default function LiveCrawl({ onCompleted }: Props) {
  const { activeCrawlId } = useProjectStore()
  const progress = useCrawlStore(s => s.progress)
  const updateProgress = useCrawlStore(s => s.updateProgress)
  const setStatus = useCrawlStore(s => s.setStatus)
  const [recentUrls, setRecentUrls] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  // Subscribe to IPC events
  useEffect(() => {
    if (!activeCrawlId) return
    try {
      window.crawldesk.crawls.get(activeCrawlId)
        .then((data: any) => updateProgress({ ...data, crawlId: activeCrawlId }))
        .catch(() => {})

      const unsub1 = window.crawldesk.crawls.onProgress((data: any) => {
        if (data.crawlId && String(data.crawlId) !== String(activeCrawlId)) return
        updateProgress(data)
        setRecentUrls(prev => [...prev.slice(-49), ...(data.newUrls || [])])
      })
      const unsub2 = window.crawldesk.crawls.onStatus((event: any) => {
        if (event.crawlId && String(event.crawlId) !== String(activeCrawlId)) return
        setStatus(event.status)
        if (event.status === 'failed') setError('Crawl failed. Check logs for details.')
        if (event.status === 'completed') {
          // Trigger post-crawl cross-page analysis (duplicate titles, canonical clusters, etc.)
          window.crawldesk.issues.runPostCrawl?.(String(activeCrawlId))
            .then((count: number) => { if (count > 0) console.log(`[LiveCrawl] Post-crawl analysis found ${count} cross-page issues`) })
            .catch((e: any) => console.warn('[LiveCrawl] Post-crawl analysis failed or not available:', e?.message))
          onCompleted()
        }
      })
      return () => { unsub1(); unsub2() }
    } catch (e: any) {
      setError(e?.message || 'Failed to connect to crawl process')
    }
  }, [activeCrawlId, updateProgress, setStatus, onCompleted])

  async function handlePause() { await window.crawldesk.crawls.pause(activeCrawlId); setStatus('paused') }
  async function handleResume() { await window.crawldesk.crawls.resume(activeCrawlId); setStatus('running') }
  async function handleStop() { await window.crawldesk.crawls.stop(activeCrawlId); setStatus('stopped'); useCrawlStore.getState().reset() }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text flex items-center gap-3">Live Crawl</h1>
          <p className="text-sm text-primary-muted mt-1">Monitoring crawl activity in real-time.</p>
        </div>
        <div className="flex items-center gap-2">
          {(progress?.status === 'running' && <span className="pill-warning px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse">● Running</span>) ||
           (progress?.status === 'paused' && <span className="pill-warning px-3 py-1.5 rounded-full text-xs font-semibold">● Paused</span>) ||
           (progress?.status === 'completed' && <span className="pill-success px-3 py-1.5 rounded-full text-xs font-semibold">✓ Completed</span>) ||
           (progress?.status === 'stopped' && <span className="pill-neutral px-3 py-1.5 rounded-full text-xs font-semibold">■ Stopped</span>) ||
           (progress?.status === 'failed' && <span className="pill-error px-3 py-1.5 rounded-full text-xs font-semibold">✕ Failed</span>) ||
           <span className="pill-neutral px-3 py-1.5 rounded-full text-xs font-semibold">{progress?.status ?? 'unknown'}</span>}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-xl p-3 bg-[#3b171b] border border-red-900 text-red-400 text-sm flex items-center gap-2">
          <span className="text-base">⚠</span> {error}
        </div>
      )}

      {/* Controls */}
      {!['completed', 'stopped', 'failed'].includes(progress?.status ?? '') && (
        <div className="flex gap-3 mb-6">
          {progress?.status === 'paused' ? (
            <button onClick={handleResume} className="btn-primary bg-emerald hover:bg-emerald/90">▶ Resume</button>
          ) : (
            <button onClick={handlePause} className="btn-secondary">⏸ Pause</button>
          )}
          <button onClick={handleStop} className="btn-danger">■ Stop</button>
        </div>
      )}

      {/* Progress Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Completed', value: progress?.total_completed ?? 0, color: 'text-emerald' },
          { label: 'Queued', value: progress?.total_queued ?? 0, color: 'text-[#3B82F6]' },
          { label: 'Discovered', value: progress?.total_discovered ?? 0, color: 'text-purple-400' },
          { label: 'Failed', value: progress?.total_failed ?? 0, color: 'text-red-500' },
          { label: 'Blocked', value: progress?.total_blocked ?? 0, color: 'text-amber' },
          { label: 'Elapsed', value: formatTime(progress?.elapsedTimeSeconds ?? 0), color: 'text-primary-text' },
        ].map(card => (
          <div key={card.label} className="kpi-card text-center">
            <p className="text-xs text-primary-muted uppercase tracking-wider font-semibold">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent URLs Table */}
      <h2 className="text-base font-semibold text-primary-text mb-3">Recent Crawled URLs ({recentUrls.length})</h2>
      {!progress && recentUrls.length === 0 && (
        <div className="card py-8 text-center text-primary-muted">No crawl in progress. Start a crawl from the Crawl Setup screen.</div>
      )}
      {recentUrls.length === 0 && progress?.status === 'running' && !error && (
        <div className="flex items-center gap-2 text-sm text-primary-muted py-8 justify-center">
          <div className="animate-spin h-4 w-4 border-2 border-teal-accent border-t-transparent rounded-full"></div>
          Waiting for first results...
        </div>
      )}
      {recentUrls.length > 0 && (
        <div className="overflow-x-auto border border-lumen rounded-lg bg-panel-dark">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="bg-midnight border-b border-row">
                <th className="px-4 py-2.5 font-medium text-primary-muted">URL</th>
                <th className="px-4 py-2.5 font-medium text-primary-muted w-24">Status</th>
                <th className="px-4 py-2.5 font-medium text-primary-muted w-36">Title</th>
                <th className="px-4 py-2.5 font-medium text-primary-muted w-24">Depth</th>
              </tr>
            </thead>
            <tbody>
              {recentUrls.map((u, i) => {
                const code = u.status_code ?? 0
                return (
                  <tr key={`${u.url}-${i}`} className={`border-b border-row transition-colors ${i === recentUrls.length - 1 ? 'animate-pulse' : ''}`}>
                    <td className="px-4 py-2 max-w-xs truncate text-teal-text">{typeof u === 'string' ? u : u.url}</td>
                    <td className="px-4 py-2">
                      {code >= 200 && code < 300 && <span className="pill-success">{code}</span>}
                      {code >= 300 && code < 400 && <span className="pill-warning">{code}</span>}
                      {(code < 200 || code >= 400) && <span className="pill-error">{code || '-'}</span>}
                    </td>
                    <td className="px-4 py-2 max-w-[200px] truncate text-primary-text">{u.title || '-'}</td>
                    <td className="px-4 py-2 text-primary-text">{u.depth ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
