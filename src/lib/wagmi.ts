import { http, createConfig } from 'wagmi'
import { mainnet, polygon, base, arbitrum } from 'wagmi/chains'
import { getDefaultWallets } from '@rainbow-me/rainbowkit'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

const { connectors } = getDefaultWallets({
  appName: 'RWA Dashboard',
  projectId
})

export const config = createConfig({
  chains: [mainnet, base, polygon, arbitrum],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
})
