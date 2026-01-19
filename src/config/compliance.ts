export type ComplianceBadgeStatus = 'verified' | 'pending' | 'missing' | 'expired'

export type ComplianceDocumentStatus = 'active' | 'expired' | 'pending' | 'missing'

export type ComplianceChecklistStatus = 'pass' | 'watch' | 'fail' | 'missing'

export type ComplianceBadge = {
  id: string
  label: string
  status: ComplianceBadgeStatus
  detail: string
}

export type ComplianceDocument = {
  id: string
  title: string
  issuer: string
  issuedAt: string
  expiresAt?: string
  status?: ComplianceDocumentStatus
  documentHash?: string
  url?: string
  notes?: string
}

export type ComplianceEvent = {
  id: string
  date: string
  label: string
  detail: string
}

export type ComplianceChecklistItem = {
  id: string
  label: string
  status: ComplianceChecklistStatus
  detail: string
}

export type ComplianceProfile = {
  slug: string
  issuer: string
  category: string
  coverage: string
  methodology?: string
  badges: ComplianceBadge[]
  documents: ComplianceDocument[]
  timeline: ComplianceEvent[]
  checklist: ComplianceChecklistItem[]
  notes?: string[]
}
