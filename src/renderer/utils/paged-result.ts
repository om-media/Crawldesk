export interface PagedResult<T> {
  items: T[]
  total: number
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

export function normalizePagedResult<T = unknown>(result: unknown): PagedResult<T> {
  if (Array.isArray(result)) {
    const items = Array.isArray(result[0]) ? result[0] as T[] : []
    return {
      items,
      total: finiteNumber(result[1], items.length),
    }
  }

  if (result && typeof result === 'object') {
    const record = result as { items?: unknown; total?: unknown }
    const items = Array.isArray(record.items) ? record.items as T[] : []
    return {
      items,
      total: finiteNumber(record.total, items.length),
    }
  }

  return { items: [], total: 0 }
}
