import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'

declare global { interface Window { crawldesk: any } }

interface ClusterMember { url: string; score: number }
interface ContentCluster { id: number; size: number; representativeUrl: string; members: ClusterMember[]; keywords: string[] }

export default function ClustersScreen() {
  const { activeCrawlId } = useProjectStore()
  const [clusters, setClusters] = useState<ContentCluster[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)

  async function analyze() {
    if (!activeCrawlId) return
    setLoading(true)
    try {
      const result = await window.crawldesk.clusters.find(activeCrawlId)
      setClusters(result || [])
    } catch (e: any) {
      console.error('[Clusters] Failed to cluster:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { analyze() }, [activeCrawlId])

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">No data for clustering.</p>
      <p className="text-sm text-primary-muted mt-2">Complete a crawl first, then view content clusters here.</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-2">Content Clusters</h1>
      <p className="text-sm text-primary-muted mb-6">TF-IDF based semantic similarity clustering. Pages grouped by shared topical keywords — potential cannibalization candidates flagged within each cluster.</p>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full mr-3"></div>
          <span className="text-primary-muted">Analyzing content similarity...</span>
        </div>
      )}

      {!loading && clusters.length === 0 && (
        <div className="card py-10 text-center">
          <p className="text-primary-text">No clusters found — all pages appear to cover distinct topics.</p>
        </div>
      )}

      {!loading && clusters.map(cluster => (
        <div key={cluster.id} className="mb-4 border border-lumen rounded-lg bg-panel-dark overflow-hidden">
          <button onClick={() => setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#0f1f2a] transition-colors text-left">
            <div>
              <span className="font-semibold text-primary-text">{cluster.size} URLs</span>
              <span className="text-xs text-primary-muted ml-3">Shared keywords: {cluster.keywords.join(', ') || '—'}</span>
            </div>
            <span className="text-primary-muted text-sm">{expandedCluster === cluster.id ? '▾' : '▸'}</span>
          </button>
          {expandedCluster === cluster.id && (
            <div className="px-5 pb-4">
              <p className="text-xs text-primary-muted mb-2 font-medium uppercase tracking-wider">Representative URL</p>
              <code className="block bg-midnight p-2 rounded text-xs text-teal-accent break-all mb-3">{cluster.representativeUrl}</code>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-row"><th className="py-1.5 pr-4 text-left text-primary-muted">URL</th><th className="py-1.5 text-right text-primary-muted w-20">Similarity</th></tr></thead>
                <tbody>
                  {cluster.members.map(m => (
                    <tr key={m.url} className="border-b border-row hover:bg-[#0a1820] transition-colors">
                      <td className="py-1.5 pr-4 break-all text-primary-text max-w-lg truncate">{m.url}</td>
                      <td className="py-1.5 text-right text-primary-muted tabular-nums">{Math.round(m.score * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
