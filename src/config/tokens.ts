import deploymentConfig from '../../hardhat/config/deployment.json'

export const RWA_TOKENS = ['MPL', 'CFG', 'GFI', 'TOKENFI']

export const CONTRACTS = {
  USDY: {
    address: '0x96f6ef951840721adbf46ac996b59e0235cb985c',
    chain: 'ethereum',
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

const deployment = deploymentConfig as DeploymentConfig

export const LOCAL_TOKENS = (deployment.tokens ?? [])
  .filter((token): token is DeploymentToken & { address: string } =>
    typeof token.address === 'string' && token.address.length > 0
  )
  .map((token) => ({
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals ?? 18,
    name: token.name,
    chainId: token.chainId ?? 31337,
    priceKey: token.priceKey,
  }))
