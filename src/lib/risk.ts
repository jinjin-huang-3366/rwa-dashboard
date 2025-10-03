import {
  AUDIT_SIGNAL_DEFINITIONS,
  COLLATERAL_SIGNAL_DEFINITIONS,
  CENTRALIZATION_SIGNAL_DEFINITIONS,
  PROTOCOL_RISK_PROFILES,
  RISK_LEVEL_BANDS,
  type AuditRating,
  type CollateralRating,
  type CentralizationRating,
  type ProtocolRiskProfile,
} from '@/config/risk'

const WEIGHTS = {
  audit: 0.35,
  collateral: 0.4,
  centralization: 0.25,
}

type RiskComponentSummary = {
  label: string
  detail: string
  score: number
}

type RiskLevelMeta = {
  key: 'low' | 'moderate' | 'high'
  label: string
  badgeClass: string
}

export type ProtocolRiskSummary = {
  slug: string
  score: number
  level: RiskLevelMeta
  components: {
    audit: RiskComponentSummary
    collateral: RiskComponentSummary
    centralization: RiskComponentSummary
  }
  notes: string[]
}

const resolveProfile = (slug: string): ProtocolRiskProfile | undefined => {
  return PROTOCOL_RISK_PROFILES[slug]
}

const deriveComponent = <Rating extends string>(
  rating: Rating,
  detail: string,
  definitions: Record<Rating, { label: string; score: number }>
): RiskComponentSummary => {
  const definition = definitions[rating]
  return {
    label: definition?.label ?? 'Unknown',
    detail,
    score: definition?.score ?? 60,
  }
}

const pickLevel = (score: number): RiskLevelMeta => {
  const band = RISK_LEVEL_BANDS.find((candidate) => score < candidate.maxScore)
  const resolved = band ?? RISK_LEVEL_BANDS[RISK_LEVEL_BANDS.length - 1]
  return {
    key: resolved.key,
    label: resolved.label,
    badgeClass: resolved.badgeClass,
  }
}

export function getProtocolRiskSummary(slug: string): ProtocolRiskSummary | null {
  const profile = resolveProfile(slug)
  if (!profile) return null

  const audit = deriveComponent<AuditRating>(
    profile.audit.category,
    profile.audit.detail,
    AUDIT_SIGNAL_DEFINITIONS
  )

  const collateral = deriveComponent<CollateralRating>(
    profile.collateral.category,
    profile.collateral.detail,
    COLLATERAL_SIGNAL_DEFINITIONS
  )

  const centralization = deriveComponent<CentralizationRating>(
    profile.centralization.category,
    profile.centralization.detail,
    CENTRALIZATION_SIGNAL_DEFINITIONS
  )

  const rawScore =
    audit.score * WEIGHTS.audit +
    collateral.score * WEIGHTS.collateral +
    centralization.score * WEIGHTS.centralization

  const roundedScore = Math.round(rawScore * 10) / 10
  const level = pickLevel(roundedScore)

  return {
    slug,
    score: roundedScore,
    level,
    components: {
      audit,
      collateral,
      centralization,
    },
    notes: profile.notes ?? [],
  }
}
