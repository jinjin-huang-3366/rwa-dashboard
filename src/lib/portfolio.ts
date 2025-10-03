import axios from 'axios'
import { createPublicClient, http } from 'viem'
import { mainnet, hardhat } from 'viem/chains'
import {
  CONTRACTS,
  MAINNET_TOKENS,
  LOCAL_TOKENS,
  TOKEN_PROTOCOLS,
  ProtocolMetadata,
} from '@/config/tokens'
import { balanceOfAbi, decimalsAbi, symbolAbi } from '@/config/erc20Abi'

// client for Ethereum mainnet
const client = createPublicClient({ chain: mainnet, transport: http() })
// client for local Hardhat dev chain
const localClient = createPublicClient({ chain: hardhat, transport: http() })

export type PortfolioHolding = {
  symbol: string
  balance: number
  price: number
  value: number
  protocol?: ProtocolMetadata
}

const normalizeSymbol = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  return value.toUpperCase()
}

const getProtocolForSymbol = (symbol: string | undefined) => {
  if (!symbol) return undefined
  return TOKEN_PROTOCOLS[symbol]
}

export async function fetchPortfolio(address: string): Promise<PortfolioHolding[]> {
  const results: PortfolioHolding[] = []
  const usdy = CONTRACTS.USDY.address as `0x${string}`
  const usdyPriceKey = `ethereum:${usdy}`

  const priceKeySet = new Set<string>()
  priceKeySet.add(usdyPriceKey)

  for (const token of MAINNET_TOKENS) {
    if (token.priceKey) {
      priceKeySet.add(token.priceKey)
    }
  }

  for (const token of LOCAL_TOKENS) {
    if (token.priceKey) {
      priceKeySet.add(token.priceKey)
    }
  }

  const priceLookup: Record<string, number> = {}
  const priceKeys = Array.from(priceKeySet)

  if (priceKeys.length > 0) {
    try {
      const priceResp = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
      )
      const coins = priceResp.data?.coins ?? {}
      for (const key of priceKeys) {
        const entry = coins[key]
        const maybePrice = entry?.price
        if (typeof maybePrice === 'number') {
          priceLookup[key] = maybePrice
        }
      }
    } catch (error) {
      console.error('Token price fetch failed', error)
    }
  }

  // 1) RWA tokens via direct on-chain query (Ethereum mainnet)
  for (const token of MAINNET_TOKENS) {
    try {
      const rawBalance = await client.readContract({
        address: token.address as `0x${string}`,
        abi: balanceOfAbi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })

      const balance = Number(rawBalance) / 10 ** token.decimals

      if (balance <= 0) {
        continue
      }

      const symbol = normalizeSymbol(token.symbol) ?? token.symbol
      const price = token.priceKey ? priceLookup[token.priceKey] ?? 0 : 0

      results.push({
        symbol,
        balance,
        price,
        value: balance * price,
        protocol: token.protocol ?? getProtocolForSymbol(symbol),
      })
    } catch (error) {
      console.warn(`Mainnet token read skipped for ${token.symbol}`, error)
    }
  }

  // 2) USDY via direct on-chain query (Ethereum mainnet)
  try {
    const rawBalance = await client.readContract({
      address: usdy,
      abi: balanceOfAbi,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    })
    const decimals = await client.readContract({
      address: usdy,
      abi: decimalsAbi,
      functionName: 'decimals',
    })
    const rawSymbol = await client.readContract({
      address: usdy,
      abi: symbolAbi,
      functionName: 'symbol',
    })

    const decimalsNumber = Number(decimals)
    const divider = Number.isFinite(decimalsNumber) ? 10 ** decimalsNumber : 1
    const balance = divider !== 0 ? Number(rawBalance) / divider : 0
    const symbol = normalizeSymbol(rawSymbol) ?? 'USDY'

    if (balance > 0) {
      const price = priceLookup[usdyPriceKey] ?? 0

      results.push({
        symbol,
        balance,
        price,
        value: balance * price,
        protocol: CONTRACTS.USDY.protocol ?? getProtocolForSymbol(symbol),
      })
    }
  } catch (e) {
    console.error('USDY read failed', e)
  }

  // 3) Local dev token(s) on Hardhat
  for (const token of LOCAL_TOKENS) {
    try {
      const rawBalance = await localClient.readContract({
        address: token.address as `0x${string}`,
        abi: balanceOfAbi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })
      const decimals = await localClient.readContract({
        address: token.address as `0x${string}`,
        abi: decimalsAbi,
        functionName: 'decimals',
      })
      const rawSymbol = await localClient.readContract({
        address: token.address as `0x${string}`,
        abi: symbolAbi,
        functionName: 'symbol',
      })

      const decimalsNumber = Number(decimals)
      const divider = Number.isFinite(decimalsNumber) ? 10 ** decimalsNumber : 1
      const balance = divider !== 0 ? Number(rawBalance) / divider : 0
      const symbol = normalizeSymbol(rawSymbol) ?? token.symbol

      if (balance > 0) {
        const priceKey = token.priceKey ?? ''
        const price = priceKey.length > 0 ? priceLookup[priceKey] ?? 1 : 1

        results.push({
          symbol,
          balance,
          price,
          value: balance * price,
          protocol: token.protocol ?? getProtocolForSymbol(symbol),
        })
      }
    } catch (error) {
      console.warn(`Local token read skipped for ${token.symbol}`, error)
    }
  }

  return results
}

