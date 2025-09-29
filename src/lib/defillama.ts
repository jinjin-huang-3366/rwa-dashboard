import axios from 'axios'

const TARGET_PROTOCOLS = [
  'maple',
  'maple-rwa',
  'goldfinch',
  'tokenfi',
  'centrifuge-protocol',
  'ondo-yield-assets',
  'ondo-global-markets'
]


export async function fetchRWAProtocols() {
  const { data } = await axios.get('https://api.llama.fi/protocols')
  console.log(data.map((p: any) => p.slug))
  return data.filter((p: any) => TARGET_PROTOCOLS.includes(p.slug))
}

export async function fetchRWAYields() {
  const { data } = await axios.get('https://yields.llama.fi/pools')
  
  return data.data.filter((pool: any) =>
    TARGET_PROTOCOLS.includes(pool.project)
  )
}
