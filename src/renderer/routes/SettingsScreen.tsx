import { useState, useEffect } from 'react'
import ErrorBanner from '../components/ErrorBanner'

interface AppSettings {
  dataDir: string
  dbFilename: string
  maxConcurrentCrawls: number
  defaultUserAgent: string
  defaultConcurrency: number
  defaultDelayMs: number
  defaultMaxUrls: number
  defaultMaxDepth: number
  defaultTimeoutSeconds: number
}

const defaultSettings: AppSettings = {
  dataDir: '',
  dbFilename: 'crawldesk.sqlite',
  maxConcurrentCrawls: 3,
  defaultUserAgent: 'CrawlDesk SEO Crawler',
  defaultConcurrency: 5,
  defaultDelayMs: 500,
  defaultMaxUrls: 1000,
  defaultMaxDepth: 10,
  defaultTimeoutSeconds: 30,
}

function normalizeSettings(raw: any): AppSettings {
  return {
    dataDir: raw.dataDir ?? raw.data_dir ?? '',
    dbFilename: raw.dbFilename ?? raw.db_filename ?? 'crawldesk.sqlite',
    maxConcurrentCrawls: Number(raw.maxConcurrentCrawls ?? raw.max_concurrent_crawls ?? 3),
    defaultUserAgent: raw.defaultUserAgent ?? raw.default_user_agent ?? 'CrawlDesk SEO Crawler',
    defaultConcurrency: Number(raw.defaultConcurrency ?? raw.default_concurrency ?? 5),
    defaultDelayMs: Number(raw.defaultDelayMs ?? raw.default_delay_ms ?? 500),
    defaultMaxUrls: Number(raw.defaultMaxUrls ?? raw.default_max_urls ?? 1000),
    defaultMaxDepth: Number(raw.defaultMaxDepth ?? raw.default_max_depth ?? 10),
    defaultTimeoutSeconds: Number(raw.defaultTimeoutSeconds ?? raw.default_timeout_seconds ?? 30),
  }
}

export default function SettingsScreen() {
  const [version, setVersion] = useState('')
  const [dataPath, setDataPath] = useState('')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => { loadInfo(); loadSettings() }, [])

  async function loadInfo() {
    try {
      setVersion(await window.crawldesk.app.getVersion())
      setDataPath(await window.crawldesk.app.getDataPath())
    } catch (e: any) {
      console.error('[Settings] Failed to load app info:', e)
    }
  }

  async function loadSettings() {
    setLoading(true)
    setLoadError(null)
    try {
      const raw = await window.crawldesk.settings.get()
      setSettings(normalizeSettings(raw))
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const updated = await window.crawldesk.settings.update(settings)
      setSettings(normalizeSettings(updated))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  function updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Settings</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Settings</h1>

      {loadError && <ErrorBanner message={loadError} onRetry={loadSettings} />}

      {/* App Info */}
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">App Info</h2>
        <dl className="space-y-2 text-sm">
          <dt className="text-xs text-primary-muted uppercase tracking-wider font-semibold">Version</dt>
          <dd className="font-medium text-primary-text">{version}</dd>
        </dl>
      </div>

      {/* Data Storage */}
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">Data Storage</h2>
        <p className="text-sm text-primary-muted mb-2">All crawl data is stored locally in SQLite.</p>
        <code className="block bg-midnight border border-lumen rounded-lg p-3 text-xs break-all text-teal-accent">{dataPath}/crawldesk.sqlite</code>
      </div>

      {/* Crawl Defaults */}
      <div className="card mb-4" style={{ borderRadius: '12px' }}>
        <h2 className="font-semibold text-primary-text mb-3">Crawl Defaults</h2>

        {saveError && <ErrorBanner message={saveError} />}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Default Concurrency</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.defaultConcurrency}
              onChange={e => updateField('defaultConcurrency', parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Delay Between Requests (ms)</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.defaultDelayMs}
              onChange={e => updateField('defaultDelayMs', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Max URLs per Crawl</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.defaultMaxUrls}
              onChange={e => updateField('defaultMaxUrls', parseInt(e.target.value, 10) || 100)}
            />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Max Depth</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.defaultMaxDepth}
              onChange={e => updateField('defaultMaxDepth', parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Timeout (seconds)</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.defaultTimeoutSeconds}
              onChange={e => updateField('defaultTimeoutSeconds', parseInt(e.target.value, 10) || 10)}
            />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Max Concurrent Crawls</label>
            <input
              type="number"
              className="input-field w-full"
              value={settings.maxConcurrentCrawls}
              onChange={e => updateField('maxConcurrentCrawls', parseInt(e.target.value, 10) || 1)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1">Default User Agent</label>
          <input
            type="text"
            className="input-field w-full"
            value={settings.defaultUserAgent}
            onChange={e => updateField('defaultUserAgent', e.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saveSuccess && (
            <span className="text-emerald text-sm font-medium">&#10003; Settings saved</span>
          )}
        </div>
      </div>

      {/* Privacy */}
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