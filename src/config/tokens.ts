import deploymentConfig from '../../hardhat/config/deployment.json'

export const RWA_TOKENS = ['MPL', 'CFG', 'GFI', 'TOKENFI'] as const

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
