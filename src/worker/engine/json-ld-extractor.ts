import type { JsonLdBlock } from '../../shared/types/structured-data'

/**
 * Feature 3.3 — Extract JSON-LD structured data blocks from HTML.
 */
export function extractJsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = []

  // Match <script type="application/ld+json">...</script> tags
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match

  while ((match = regex.exec(html)) !== null) {
    const jsonStr = match[1].trim()
    if (!jsonStr) continue

    try {
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null) {
            blocks.push(item as JsonLdBlock)
          }
        }
      } else if (typeof parsed === 'object') {
        blocks.push(parsed as JsonLdBlock)
      }
    } catch {
      // Invalid JSON — skip silently; will be flagged as issue in detector
    }
  }

  return blocks
}

/** Get all @type values from a set of JSON-LD blocks */
export function getSchemaTypes(blocks: JsonLdBlock[]): string[] {
  const types: string[] = []
  for (const block of blocks) {
    const typeVal = block['@type']
    if (typeof typeVal === 'string') {
      types.push(typeVal)
    } else if (Array.isArray(typeVal)) {
      for (const t of typeVal) {
        if (typeof t === 'string') types.push(t)
      }
    }
  }
  return [...new Set(types)]
}
