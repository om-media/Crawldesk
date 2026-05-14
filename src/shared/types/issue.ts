export type Severity = 'critical' | 'warning' | 'info'

export type IssueCategory =
  | 'content'
  | 'structure'
  | 'links'
  | 'performance'
  | 'security'
  | 'social'
  | 'technical'
  | 'internationalization'

export interface IssueDefinition {
  id: string
  label: string
  severity: Severity
  category: IssueCategory
  explanation: string
  recommendation: string
}

export interface IssueRecordInput {
  crawlId: string
  urlId?: string
  url: string
  issue_type: string
  severity: Severity
  category?: IssueCategory
  message: string
  recommendation?: string
}

export interface IssueRecord extends IssueRecordInput {
  id: string
  created_at?: string
  detected_at?: string
  details_json?: string | null
  is_fixed?: boolean
  label?: string | null
  explanation?: string | null
  count?: number
}

export interface IssueSummary {
  issue_type: string
  severity: Severity
  category: IssueCategory
  count: number
  label: string | null
  explanation: string | null
  recommendation: string | null
}
