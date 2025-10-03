import deploymentConfig from '../../hardhat/config/deployment.json'

export const RWA_TOKENS = ['MPL', 'CFG', 'GFI', 'TOKENFI'] as const

export type RwaTokenSymbol = (typeof RWA_TOKENS)[number]

export type ProtocolMetadata = {
  slug: string
  name: string
}

export const TOKEN_PROTOCOLS: Record<string, ProtocolMetadata> = {
  USDY: { slug: 'ondo-yield-assets', name: 'Ondo' },
  MPL: { slug: 'maple', name: 'Maple' },
  CFG: { slug: 'centrifuge-protocol', name: 'Centrifuge' },
  GFI: { slug: 'goldfinch', name: 'Goldfinch' },
  TOKENFI: { slug: 'tokenfi', name: 'TokenFi' },
}

export type MainnetTokenConfig = {
  symbol: RwaTokenSymbol
  address: string
  decimals: number
  priceKey: string
  protocol?: ProtocolMetadata
}

export const MAINNET_TOKENS: MainnetTokenConfig[] = [
  {
    symbol: 'MPL',
    address: '0x33349b282065b0284d756f0577fb39c158f935e6',
    decimals: 18,
    priceKey: 'coingecko:maple',
    protocol: TOKEN_PROTOCOLS.MPL,
  },
  {
    symbol: 'CFG',
    address: '0xcccccccccc33d538dbc2ee4feab0a7a1ff4e8a94',
    decimals: 18,
    priceKey: 'coingecko:centrifuge',
    protocol: TOKEN_PROTOCOLS.CFG,
  },
  {
    symbol: 'GFI',
    address: '0xdab396ccf3d84cf2d07c4454e10c8a6f5b008d2b',
    decimals: 18,
    priceKey: 'coingecko:goldfinch',
    protocol: TOKEN_PROTOCOLS.GFI,
  },
  {
    symbol: 'TOKENFI',
    address: '0x4507cef57c46789ef8d1a19ea45f4216bae2b528',
    decimals: 18,
    priceKey: 'coingecko:tokenfi',
    protocol: TOKEN_PROTOCOLS.TOKENFI,
  },
]

export const CONTRACTS = {
  USDY: {
    address: '0x96f6ef951840721adbf46ac996b59e0235cb985c',
    chain: 'ethereum',
    protocol: TOKEN_PROTOCOLS.USDY,
  },
  // TODO: add Centrifuge pool token contracts here when you know which pools you want to track
}

type DeploymentToken = {
  address?: string
  symbol: string
  name: string
  decimals?: number
  chainId?: number
  priceKey?: string
}

type DeploymentConfig = {
  tokens?: DeploymentToken[]
}

export type LocalTokenConfig = {
  address: string
  symbol: string
  decimals: number
  name: string
  chainId: number
  priceKey?: string
  protocol?: ProtocolMetadata
}

const deployment = deploymentConfig as DeploymentConfig

export const LOCAL_TOKENS: LocalTokenConfig[] = (deployment.tokens ?? [])
  .filter((token): token is DeploymentToken & { address: string } =>
    typeof token.address === 'string' && token.address.length > 0
  )
  .map((token) => {
    const symbol = token.symbol.toUpperCase()

    return {
      address: token.address,
      symbol,
      decimals: token.decimals ?? 18,
      name: token.name,
      chainId: token.chainId ?? 31337,
      priceKey: token.priceKey,
      protocol: TOKEN_PROTOCOLS[symbol],
    }
  })
