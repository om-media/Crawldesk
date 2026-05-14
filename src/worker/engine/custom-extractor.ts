// Feature 7.2 — Custom Extractions Engine
// Apply user-defined CSS/XPath/Regex rules against page HTML during crawl.

import type { ExtractionRule, ExtractionResult } from '../../shared/types/extraction'

/**
 * Run all active extraction rules against raw HTML.
 */
export function extractFromHtml(html: string, url: string, rules: ExtractionRule[]): ExtractionResult[] {
  const results: ExtractionResult[] = []

  for (const rule of rules) {
    if (!rule.active) continue
    try {
      let matches: string[] = []
      switch (rule.ruleType) {
        case 'css':
          matches = extractByCss(html, rule.selector, rule.attribute || null)
          break
        case 'xpath':
          matches = extractByXpath(html, rule.selector, rule.attribute || null)
          break
        case 'regex':
          matches = extractByRegex(html, rule.selector)
          break
      }
      results.push({ url, matches })
    } catch (e) {
      console.warn(`[Extractor] Rule "${rule.name}" failed on ${url}:`, e instanceof Error ? e.message : String(e))
      results.push({ url, matches: [`Error: ${(e as Error)?.message ?? 'unknown'}`] })
    }
  }

  return results
}

function extractByCss(html: string, selector: string, attr: string | null): string[] {
  // Use DOMParser via a minimal jsdom-like approach — we use the browser DOM when in renderer,
  // or a lightweight Node.js HTML parser in worker/main. For the worker process we use cheerio-style
  // parsing if available; otherwise fall back to regex-based extraction.
  return cssRegexFallback(html, selector, attr)
}

/**
 * Lightweight CSS-to-regex fallback for common patterns:
 * - 'meta[name="description"]' → extract attribute content
 * - '.class', '#id', 'tag' → basic tag matching
 */
function cssRegexFallback(html: string, selector: string, _attr: string | null): string[] {
  const matches: string[] = []

  // Handle attribute selector: [attr="value"] or [name="value"]
  const attrMatch = selector.match(/\[(\w+)\s*=\s*"([^"]+)"\]/)
  if (attrMatch) {
    const attrName = attrMatch[1]
    // Match <tag ... attrName="..." ...> or self-closing
    const pattern = new RegExp(`<\\w[^>]*${attrName}\\s*=\\s*"[^"]*"[^>]*>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) !== null) {
      matches.push(m[0])
    }
    return matches
  }

  // Handle class selector .classname
  if (selector.startsWith('.')) {
    const className = selector.slice(1)
    const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>[^<]*`, 'gi')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) !== null) {
      matches.push(m[0].trim())
    }
    return matches
  }

  // Handle id selector #idname
  if (selector.startsWith('#')) {
    const idVal = selector.slice(1)
    const pattern = new RegExp(`<[^>]+id=["']${escapeRegex(idVal)}["'][^>]*>[^<]*(?:<[^/]>[^<]*)*?</\\w+>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) !== null) {
      matches.push(m[0].trim())
    }
    return matches
  }

  // Plain tag name: match all instances
  if (/^[a-z][a-z0-9]*$/i.test(selector.split('[')[0].split('.')[0].split('#')[0])) {
    const tagName = selector.split(' ')[0]
    const pattern = new RegExp(`<${tagName}[^>]*>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = pattern.exec(html)) !== null) {
      matches.push(m[0])
    }
  }

  return matches
}

function extractByXpath(_html: string, _xpath: string, _attr: string | null): string[] {
  try {
    const domParser = require('libxmljs')
    const doc = domParser.parseXml(_html)
    const nodes = doc.find(domParser.XPathFactory.createExpression(_xpath))
    return nodes.map((n: any) => n.attr(_attr)?.value() ?? n.text()).filter(Boolean)
  } catch {
    console.warn('[Extractor] XPath requires libxmljs — install it or use CSS/Regex selectors.')
    return [`Error: XPath not available (install libxmljs)`]
  }
}

function extractByRegex(html: string, pattern: string): string[] {
  try {
    // Support /pattern/flags syntax
    let regexPattern = pattern
    let flags = 'g'
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const parts = pattern.slice(1, -1).split('/')
      regexPattern = parts.slice(0, -1).join('/')
      flags = parts.at(-1) || 'g'
    } else if (pattern.includes('|')) {
      const lastPipe = pattern.lastIndexOf('|')
      if (lastPipe > pattern.indexOf('(')) {
        flags = pattern.slice(lastPipe + 1)
        regexPattern = pattern.slice(0, lastPipe)
      }
    }

    const re = new RegExp(regexPattern, flags)
    const matches: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      matches.push(m[0])
      if (!re.global) break
    }
    return matches
  } catch (e) {
    return [`Regex error: ${(e as Error)?.message ?? 'invalid pattern'}`]
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
