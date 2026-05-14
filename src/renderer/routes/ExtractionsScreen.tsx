import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'


interface ExtractionRule {
  id: string; crawl_id: string; name: string; selector: string
  rule_type: 'css' | 'xpath' | 'regex'; attribute?: string | null
  active: number; created_at: string
}

export default function ExtractionsScreen() {
  const { activeCrawlId } = useProjectStore()
  const [rules, setRules] = useState<ExtractionRule[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSelector, setFormSelector] = useState('')
  const [formType, setFormType] = useState<'css' | 'xpath' | 'regex'>('css')
  const [formAttribute, setFormAttribute] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadRules() }, [activeCrawlId])

  async function loadRules() {
    if (!activeCrawlId) return
    try {
      const rows = await window.crawldesk.extractions.list(activeCrawlId)
      setRules(rows || [])
    } catch (e) { console.error('[Extractions] Load failed:', e); setRules([]) }
  }

  function startAdd() {
    setEditing(null); setError('')
    setFormName(''); setFormSelector(''); setFormType('css'); setFormAttribute('')
  }

  function startEdit(rule: ExtractionRule) {
    setEditing(rule.id); setError('')
    setFormName(rule.name); setFormSelector(rule.selector); setFormType(rule.rule_type)
    setFormAttribute(rule.attribute || '')
  }

  function cancelEdit() { setEditing(null); setError('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!formName.trim()) { setError('Rule name is required.'); return }
    if (!formSelector.trim()) { setError('Selector / pattern is required.'); return }
    if (!activeCrawlId) return

    try {
      if (editing) {
        await window.crawldesk.extractions.update(editing, { name: formName, selector: formSelector, ruleType: formType, attribute: formAttribute || undefined })
      } else {
        await window.crawldesk.extractions.create({ crawlId: activeCrawlId, name: formName, selector: formSelector, ruleType: formType, attribute: formAttribute, active: true })
      }
      await loadRules()
      cancelEdit()
    } catch (err: any) { console.error('[Extractions] Save failed:', err); setError(err?.message || 'Failed to save rule') }
  }

  async function toggleActive(id: string, newActive: number) {
    try { await window.crawldesk.extractions.update(id, { active: newActive ? 1 : 0 }); await loadRules() }
    catch (e) { console.error('[Extractions] Toggle failed:', e) }
  }

  async function deleteRule(id: string) {
    try { await window.crawldesk.extractions.delete(id); await loadRules() }
    catch (e) { console.error('[Extractions] Delete failed:', e) }
  }

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">No extraction rules yet.</p>
      <p className="text-sm text-primary-muted mt-2">Start a crawl first and define custom extractions here.</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Custom Extractions</h1>

      {/* Add / Edit form */}
      <form onSubmit={handleSubmit} className="card mb-6">
        <h2 className="text-xs uppercase font-semibold text-primary-muted mb-4">{editing ? 'Edit Rule' : 'New Extraction Rule'}</h2>
        {error && <div className="bg-[#3b171b] border border-red-900 rounded-lg p-3 text-sm text-red-400 mb-4">{error}</div>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Rule Name *</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Meta description" className="input-field" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Type</label>
            <select value={formType} onChange={e => setFormType(e.target.value as any)} className="input-field">
              <option value="css">CSS Selector</option>
              <option value="xpath">XPath</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Selector / Pattern *</label>
            <input value={formSelector} onChange={e => setFormSelector(e.target.value)} placeholder={`e.g. meta[name="description"]`} className="input-field" required />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Attribute (optional)</label>
            <input value={formAttribute} onChange={e => setFormAttribute(e.target.value)} placeholder='e.g. content, href' className="input-field" />
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button type="submit" className="btn-primary">{editing ? 'Update Rule' : 'Add Rule'}</button>
          {editing && <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-lg border border-lumen text-sm text-primary-text hover:bg-midnight/40 transition-colors">Cancel</button>}
        </div>
      </form>

      {/* Rules list */}
      <div className="card">
        <h2 className="text-xs uppercase font-semibold text-primary-muted mb-4">Rules ({rules.length})</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-primary-muted">No extraction rules defined.</p>
        ) : (
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className={`flex items-center gap-4 p-3 rounded-lg ${r.active ? 'bg-sidebar' : 'bg-midnight/30 opacity-60'} border border-lumen/50`}>
                <input
                  type="checkbox" checked={!!r.active} onChange={() => toggleActive(r.id, r.active ? 0 : 1)}
                  className="w-4 h-4 rounded border-lumen text-teal-accent bg-panel-dark mt-1" title={r.active ? 'Deactivate' : 'Activate'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary-text">{r.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      r.rule_type === 'css' ? 'bg-blue-500/15 text-blue-400' : r.rule_type === 'xpath' ? 'bg-purple-500/15 text-purple-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>{r.rule_type}</span>
                  </div>
                  <p className="text-xs text-primary-muted truncate mt-0.5" title={r.selector}>{r.selector}{r.attribute ? ` → ${r.attribute}` : ''}</p>
                </div>
                <button onClick={() => startEdit(r)} className="text-xs text-teal-accent hover:underline shrink-0">Edit</button>
                <button onClick={() => deleteRule(r.id)} className="text-xs text-red-400 hover:text-red-300 shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
