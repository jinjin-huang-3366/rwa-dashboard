import axios from 'axios'

export const TARGET_PROTOCOLS = [
  'maple',
  'maple-rwa',
  'goldfinch',
  'tokenfi',
  'centrifuge-protocol',
  'ondo-yield-assets',
  'ondo-global-markets',
] as const

export const PROTOCOL_YIELD_SOURCES: Record<string, string[]> = {
  maple: ['maple', 'midas-rwa'],
  'maple-rwa': ['maple', 'midas-rwa'],
  goldfinch: ['goldfinch'],
  'ondo-yield-assets': ['flux-finance'],
  'ondo-global-markets': ['flux-finance'],
}

const YIELD_PROJECT_ALLOWLIST = Array.from(
  new Set(Object.values(PROTOCOL_YIELD_SOURCES).flat())
)

export const extractBorrowedValue = (protocol: any): number | null => {
  if (!protocol || typeof protocol !== 'object') return null

  const chainTvls: unknown = (protocol as any).chainTvls
  if (!chainTvls || typeof chainTvls !== 'object') return null

  const candidates: number[] = []

  const consider = (value: unknown) => {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric) && numeric > 0) {
      candidates.push(numeric)
    }
  }

  if ('borrowed' in (chainTvls as Record<string, unknown>)) {
    consider((chainTvls as any).borrowed)
  }

  for (const [key, value] of Object.entries(chainTvls as Record<string, unknown>)) {
    if (key.toLowerCase().includes('borrowed')) {
      consider(value)
    }
  }

  if (candidates.length === 0) return null
  return Math.max(...candidates)
}

export async function fetchRWAProtocols() {
  const { data } = await axios.get('https://api.llama.fi/protocols')
  return data
    .filter((p: any) => TARGET_PROTOCOLS.includes(p.slug))
    .map((protocol: any) => {
      const directBorrowed =
        typeof protocol?.borrowed === 'number' && Number.isFinite(protocol.borrowed)
          ? protocol.borrowed
          : null
      const borrowed = directBorrowed ?? extractBorrowedValue(protocol)

      return {
        ...protocol,
        borrowed,
      }
    })
}

export async function fetchRWAYields() {
  const { data } = await axios.get('https://yields.llama.fi/pools')
  const pools = data?.data ?? []

  if (!Array.isArray(pools)) {
    return []
  }

  return pools.filter((pool: any) => YIELD_PROJECT_ALLOWLIST.includes(pool.project))
}
