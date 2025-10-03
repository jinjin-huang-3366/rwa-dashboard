export type AuditRating =
  | 'external_recent'
  | 'external_outdated'
  | 'self_reported'
  | 'no_audit'

export type CollateralRating =
  | 'us_treasuries'
  | 'investment_grade_credit'
  | 'private_credit'
  | 'emerging_markets'
  | 'crypto_overcollateralized'
  | 'uncollateralized'

export type CentralizationRating =
  | 'fully_trustless'
  | 'multisig_reputable'
  | 'single_admin'
  | 'opaque'

type RiskSignalDefinition = {
  label: string
  score: number
}

type RiskBand = {
  key: 'low' | 'moderate' | 'high'
  label: string
  maxScore: number
  badgeClass: string
}

type RiskDimensionDefinition<Rating extends string> = Record<Rating, RiskSignalDefinition>

export const AUDIT_SIGNAL_DEFINITIONS: RiskDimensionDefinition<AuditRating> = {
  external_recent: {
    label: 'External audit (<=12 months)',
    score: 10,
  },
  external_outdated: {
    label: 'External audit (>12 months)',
    score: 25,
  },
  self_reported: {
    label: 'Self-reported testing',
    score: 45,
  },
  no_audit: {
    label: 'No public audit',
    score: 70,
  },
}

export const COLLATERAL_SIGNAL_DEFINITIONS: RiskDimensionDefinition<CollateralRating> = {
  us_treasuries: {
    label: 'Backed by US Treasuries',
    score: 10,
  },
  investment_grade_credit: {
    label: 'Investment-grade credit',
    score: 25,
  },
  private_credit: {
    label: 'Private credit/structured deals',
    score: 40,
  },
  emerging_markets: {
    label: 'Emerging-market lending',
    score: 55,
  },
  crypto_overcollateralized: {
    label: 'Crypto or on-chain collateral',
    score: 45,
  },
  uncollateralized: {
    label: 'Uncollateralized exposure',
    score: 80,
  },
}

export const CENTRALIZATION_SIGNAL_DEFINITIONS: RiskDimensionDefinition<CentralizationRating> = {
  fully_trustless: {
    label: 'Fully trustless / immutable',
    score: 10,
  },
  multisig_reputable: {
    label: 'Reputable multisig / DAO',
    score: 30,
  },
  single_admin: {
    label: 'Single admin or small core team',
    score: 55,
  },
  opaque: {
    label: 'Opaque control',
    score: 75,
  },
}

export const RISK_LEVEL_BANDS: RiskBand[] = [
  {
    key: 'low',
    label: 'Low',
    maxScore: 30,
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/60',
  },
  {
    key: 'moderate',
    label: 'Moderate',
    maxScore: 55,
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-400/60',
  },
  {
    key: 'high',
    label: 'High',
    maxScore: 101,
    badgeClass: 'bg-red-500/10 text-red-300 border-red-400/60',
  },
]

type RiskDimensionValue<Rating extends string> = {
  category: Rating
  detail: string
}

export type ProtocolRiskProfile = {
  audit: RiskDimensionValue<AuditRating>
  collateral: RiskDimensionValue<CollateralRating>
  centralization: RiskDimensionValue<CentralizationRating>
  notes?: string[]
}

export const PROTOCOL_RISK_PROFILES: Record<string, ProtocolRiskProfile> = {
  'ondo-yield-assets': {
    audit: {
      category: 'external_recent',
      detail: 'Quantstamp audit (2024) covering Ondo US Treasuries vault contracts.',
    },
    collateral: {
      category: 'us_treasuries',
      detail: 'Short-term US Treasuries custodied with regulated broker-dealer partners.',
    },
    centralization: {
      category: 'multisig_reputable',
      detail: 'Upgrade and redemption controls gated by Ondo DAO multi-sig with institutional signers.',
    },
    notes: ['Investor onboarding and redemptions require KYC/AML via Ondo Finance.'],
  },
  'ondo-global-markets': {
    audit: {
      category: 'external_outdated',
      detail: 'Last full audit published in 2023 before product expansion.',
    },
    collateral: {
      category: 'investment_grade_credit',
      detail: 'Tokenized notes referencing investment-grade debt managed by Ondo affiliates.',
    },
    centralization: {
      category: 'multisig_reputable',
      detail: 'Portfolio changes executed through the same Ondo DAO multi-sig governance.',
    },
    notes: ['Cross-border investor limitations apply depending on jurisdiction.'],
  },
  maple: {
    audit: {
      category: 'external_recent',
      detail: 'Multiple external audits (Halborn 2023, Spearbit reviews) of Maple lending pools.',
    },
    collateral: {
      category: 'private_credit',
      detail: 'Senior secured corporate credit originated via Maple pool delegates.',
    },
    centralization: {
      category: 'multisig_reputable',
      detail: 'Delegate approvals and parameter changes require Maple DAO multi-sig sign-off.',
    },
    notes: ['Credit underwriting depends on third-party pool delegates; diversification varies by pool.'],
  },
  'maple-rwa': {
    audit: {
      category: 'external_recent',
      detail: 'Shares the Maple audit program (Halborn 2023 plus ongoing reviews).',
    },
    collateral: {
      category: 'private_credit',
      detail: 'Real-world corporate credit exposures similar to Maple flagship pools.',
    },
    centralization: {
      category: 'multisig_reputable',
      detail: 'Governed via Maple DAO multi-sig with delegate participation.',
    },
    notes: ['Pool concentration can increase credit correlation during stress events.'],
  },
  'centrifuge-protocol': {
    audit: {
      category: 'external_outdated',
      detail: 'Runtime and Tinlake contracts audited in 2022; incremental updates since then.',
    },
    collateral: {
      category: 'private_credit',
      detail: 'Asset-backed financing backed by trade finance and invoice factoring pools.',
    },
    centralization: {
      category: 'multisig_reputable',
      detail: 'Tinlake pools managed by issuers under Centrifuge governance multi-sig.',
    },
    notes: ['Individual pools vary; investors must diligence issuer performance and pool covenants.'],
  },
  goldfinch: {
    audit: {
      category: 'external_outdated',
      detail: 'Last major audit (Trail of Bits, 2022) covering core protocol contracts.',
    },
    collateral: {
      category: 'emerging_markets',
      detail: 'Loans to emerging-market fintech lenders with limited public reporting.',
    },
    centralization: {
      category: 'single_admin',
      detail: 'Core protocol upgrades and borrower approvals still routed through core team multi-sig.',
    },
    notes: ['Performance tied to emerging-market borrower health; longer liquidity lockups than peers.'],
  },
  tokenfi: {
    audit: {
      category: 'self_reported',
      detail: 'Team cites internal reviews; no independent audit report published.',
    },
    collateral: {
      category: 'uncollateralized',
      detail: 'Token utility relies on launchpad traction; no asset backing.',
    },
    centralization: {
      category: 'single_admin',
      detail: 'Administrative functions controlled by small founding team multi-sig.',
    },
    notes: ['High reliance on roadmap execution and community adoption; liquidity can be thin.'],
  },
}
