import { useState, useEffect } from 'react'

declare global { interface Window { crawldesk: any } }

export default function SettingsScreen() {
  const [version, setVersion] = useState('')
  const [dataPath, setDataPath] = useState('')

  useEffect(() => { loadInfo() }, [])

  async function loadInfo() { try { setVersion(await window.crawldesk.app.getVersion()); setDataPath(await window.crawldesk.app.getDataPath()) } catch (e) { console.error('[Settings] Failed to load app info:', e) } }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Settings</h1>
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">App Info</h2>
        <dl className="space-y-2 text-sm">
          <dt className="text-xs text-primary-muted uppercase tracking-wider font-semibold">Version</dt>
          <dd className="font-medium text-primary-text">{version}</dd>
        </dl>
      </div>
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">Data Storage</h2>
        <p className="text-sm text-primary-muted mb-2">All crawl data is stored locally in SQLite.</p>
        <code className="block bg-midnight border border-lumen rounded-lg p-3 text-xs break-all text-teal-accent">{dataPath}/crawldesk.sqlite</code>
      </div>
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">Privacy</h2>
        <ul className="text-sm space-y-2 text-primary-muted">
          <li>All crawling happens on your machine — no data leaves your device.</li>
          <li>No account or login required for the MVP.</li>
          <li>Crawl results are persisted only in local SQLite.</li>
        </ul>
      </div>
    </div>
  )
}
