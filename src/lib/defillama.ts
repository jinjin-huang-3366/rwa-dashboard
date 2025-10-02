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

export async function fetchRWAProtocols() {
  const { data } = await axios.get('https://api.llama.fi/protocols')
  return data.filter((p: any) => TARGET_PROTOCOLS.includes(p.slug))
}

export async function fetchRWAYields() {
  const { data } = await axios.get('https://yields.llama.fi/pools')
  const pools = data?.data ?? []

  if (!Array.isArray(pools)) {
    return []
  }

  return pools.filter((pool: any) => YIELD_PROJECT_ALLOWLIST.includes(pool.project))
}
