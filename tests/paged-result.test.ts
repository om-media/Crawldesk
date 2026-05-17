import { describe, expect, it } from 'vitest'
import { normalizePagedResult } from '../src/renderer/utils/paged-result'

describe('normalizePagedResult', () => {
  it('normalizes Tauri tuple results', () => {
    const result = normalizePagedResult([[{ id: 1 }, { id: 2 }], 2])

    expect(result.items).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.total).toBe(2)
  })

  it('normalizes tuple results with explicit totals', () => {
    const result = normalizePagedResult([[{ id: 1 }], 42])

    expect(result.items).toEqual([{ id: 1 }])
    expect(result.total).toBe(42)
  })

  it('normalizes object results used by mock mode', () => {
    const result = normalizePagedResult({ items: [{ id: 'a' }], total: '7' })

    expect(result.items).toEqual([{ id: 'a' }])
    expect(result.total).toBe(7)
  })
})
