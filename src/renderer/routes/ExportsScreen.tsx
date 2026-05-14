import { useState } from 'react'
import { useProjectStore } from '../stores/project-store'

declare global { interface Window { crawldesk: any } }

export default function ExportsScreen() {
  const { activeCrawlId } = useProjectStore()
  const [message, setMessage] = useState('')

  async function exportUrls() { if (!activeCrawlId) return; try { const r = await window.crawldesk.exports.exportUrls({ crawlId: activeCrawlId }); setMessage(`Exported ${r.rowCount} URLs to ${r.filePath}`) } catch (e: any) { setMessage(e.message) } }
  async function exportIssues() { if (!activeCrawlId) return; try { const r = await window.crawldesk.exports.exportIssues({ crawlId: activeCrawlId }); setMessage(`Exported ${r.rowCount} issues to ${r.filePath}`) } catch (e: any) { setMessage(e.message) } }
  async function exportLinks() { if (!activeCrawlId) return; try { const r = await window.crawldesk.exports.exportLinks({ crawlId: activeCrawlId }); setMessage(`Exported ${r.rowCount} links to ${r.filePath}`) } catch (e: any) { setMessage(e.message) } }

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">No data to export.</p>
      <p className="text-sm text-primary-muted mt-2">Complete a crawl first, then export results here.</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Exports</h1>
      {message && (
        <div className={`mb-4 rounded-xl p-3 text-sm border ${message.startsWith('Exported') ? 'bg-emerald/10 border-emerald/30 text-emerald' : 'bg-red-500/10 border-red-900 text-red-400'}`}>
          {message}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[{ label: 'All URLs CSV', desc: 'Export all crawled URLs with SEO metadata.', action: exportUrls }, { label: 'Issues CSV', desc: 'Export detected issues grouped by severity.', action: exportIssues }, { label: 'Links CSV', desc: 'Export all internal and external links found.', action: exportLinks }].map(item => (
          <div key={item.label} className="card flex flex-col" style={{ borderRadius: '12px' }}>
            <h3 className="font-semibold text-primary-text">{item.label}</h3>
            <p className="text-sm text-primary-muted mt-1">{item.desc}</p>
            <button onClick={item.action} className="btn-primary mt-auto pt-6 !py-3">{item.label}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
