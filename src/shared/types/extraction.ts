// Feature 7.2 — Custom Extractions Types (CSS/XPath/Regex rule system)

export type ExtractionRuleType = 'css' | 'xpath' | 'regex'

export interface ExtractionRule {
  id: string
  crawlId: string
  name: string           // Human-readable rule label
  selector: string       // CSS selector, XPath expression, or regex pattern
  ruleType: ExtractionRuleType
  attribute?: string     // Optional: extract this specific attribute (e.g., 'href', 'data-id')
  active: boolean
  created_at: string
}

export interface ExtractionResult {
  url: string
  matches: string[]      // Extracted values for a single URL
}
