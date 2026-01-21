import {
  type ComplianceBadge,
  type ComplianceChecklistItem,
  type ComplianceDocument,
  type ComplianceDocumentStatus,
  type ComplianceEvent,
  type ComplianceProfile,
} from '@/config/compliance'

export type ComplianceSourceProtocol = {
  slug?: string
  name?: string
  category?: string | null
  chain?: string | null
  chains?: string[]
  description?: string | null
  methodology?: string | null
  tags?: string[]
  audits?: string | number | null
  audit_links?: string[]
  audit_note?: string | null
  hallmarks?: Array<[number, string]>
  url?: string | null
}

const parseDate = (value: string | undefined) => {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date
}

const toHostName = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

const resolveAuditCount = (value: string | number | null | undefined) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export const formatComplianceDate = (value: string | undefined) => {
  const date = parseDate(value)
  if (!date) return 'N/A'
  return date.toLocaleDateString()
}

export const resolveDocumentStatus = (
  document: ComplianceDocument,
  referenceDate: Date = new Date()
): ComplianceDocumentStatus => {
  if (document.status && document.status !== 'active') {
    return document.status
  }

  const expiresAt = parseDate(document.expiresAt)
  if (expiresAt && expiresAt.getTime() < referenceDate.getTime()) {
    return 'expired'
  }

  return document.status ?? 'active'
}

export const buildComplianceProfile = (
  protocol: ComplianceSourceProtocol | null | undefined
): ComplianceProfile | null => {
  if (!protocol?.slug) return null

  const auditLinks = normalizeList(protocol.audit_links)
  const auditCount = resolveAuditCount(protocol.audits)
  const tags = normalizeList(protocol.tags)

  const issuer = protocol.name ?? 'Unknown issuer'
  const category = protocol.category ?? (tags[0] ?? 'Not disclosed')
  const coverage =
    protocol.chain ??
    (Array.isArray(protocol.chains) && protocol.chains.length > 0
      ? protocol.chains.join(', ')
      : 'Not disclosed')

  const badges: ComplianceBadge[] = []
  const hasAudit = auditCount > 0 || auditLinks.length > 0
  badges.push({
    id: `${protocol.slug}-audit`,
    label: 'Audit',
    status: hasAudit ? 'verified' : 'missing',
    detail: hasAudit
      ? `Audit count reported: ${auditCount}.`
      : 'No audit information published.',
  })

  const hasDisclosure = Boolean(protocol.description) || tags.length > 0
  badges.push({
    id: `${protocol.slug}-disclosure`,
    label: 'Disclosures',
    status: hasDisclosure ? 'verified' : 'missing',
    detail: hasDisclosure
      ? 'Protocol description and tags disclosed.'
      : 'No public disclosures in the data feed.',
  })

  if (protocol.methodology) {
    badges.push({
      id: `${protocol.slug}-methodology`,
      label: 'Methodology',
      status: 'verified',
      detail: 'Methodology disclosed in DeFiLlama.',
    })
  }

  const documents: ComplianceDocument[] =
    auditLinks.length > 0
      ? auditLinks.map((link, index) => ({
          id: `${protocol.slug}-audit-${index + 1}`,
          title: 'Audit report',
          issuer: toHostName(link) ?? issuer,
          issuedAt: 'N/A',
          status: 'active',
          url: link,
        }))
      : [
          {
            id: `${protocol.slug}-audit-missing`,
            title: 'Audit report',
            issuer,
            issuedAt: 'N/A',
            status: 'missing',
            notes: 'No audit link is published in the protocol feed.',
          },
        ]

  const timeline: ComplianceEvent[] = Array.isArray(protocol.hallmarks)
    ? protocol.hallmarks.map(([timestamp, label], index) => ({
        id: `${protocol.slug}-hallmark-${index + 1}`,
        date: new Date(timestamp * 1000).toISOString(),
        label,
        detail: 'Protocol milestone reported by DeFiLlama.',
      }))
    : []

  const checklist: ComplianceChecklistItem[] = [
    {
      id: `${protocol.slug}-audit-docs`,
      label: 'Audit documentation available',
      status: auditLinks.length > 0 ? 'pass' : hasAudit ? 'watch' : 'missing',
      detail:
        auditLinks.length > 0
          ? 'Audit links published.'
          : hasAudit
          ? 'Audit count reported, but documents are missing.'
          : 'No audit data disclosed.',
    },
    {
      id: `${protocol.slug}-disclosure`,
      label: 'Disclosure summary',
      status: protocol.description ? 'pass' : tags.length > 0 ? 'watch' : 'missing',
      detail: protocol.description
        ? 'Description published in protocol feed.'
        : tags.length > 0
        ? 'Tags published without description.'
        : 'No disclosures published.',
    },
    {
      id: `${protocol.slug}-methodology`,
      label: 'Methodology disclosed',
      status: protocol.methodology ? 'pass' : 'missing',
      detail: protocol.methodology
        ? 'Methodology details are available.'
        : 'Methodology details not provided.',
    },
  ]

  const notes: string[] = []
  if (protocol.audit_note) {
    notes.push(protocol.audit_note)
  }
  if (protocol.description) {
    notes.push(protocol.description)
  }

  return {
    slug: protocol.slug,
    issuer,
    category,
    coverage,
    methodology: protocol.methodology ?? undefined,
    badges,
    documents,
    timeline,
    checklist,
    notes: notes.length > 0 ? notes : undefined,
  }
}
