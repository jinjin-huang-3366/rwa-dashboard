import axios from 'axios'
import { createPublicClient, http } from 'viem'
import { mainnet, hardhat } from 'viem/chains'
import {
  CONTRACTS,
  RWA_TOKENS,
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

  // 1) Generic ERC-20s via DeFiLlama balances API
  const url = `https://coins.llama.fi/balances?address=${address}&chain=ethereum`
  try {
    const { data } = await axios.get(url)

    const balancesFromLlama: PortfolioHolding[] = Object.values<any>(data?.coins ?? {})
      .map((coin) => {
        const symbol = normalizeSymbol(coin?.symbol)
        if (!symbol || !RWA_TOKENS.includes(symbol)) {
          return null
        }

        const decimals = Number(coin?.decimals ?? 18)
        const divider = Number.isFinite(decimals) ? 10 ** decimals : 1
        const rawBalance = Number(coin?.balance ?? 0)
        const balance = divider !== 0 ? rawBalance / divider : 0

        if (balance <= 0) {
          return null
        }

        const price = Number(coin?.price ?? 0)
        const value = balance * price

        return {
          symbol,
          balance,
          price,
          value,
          protocol: getProtocolForSymbol(symbol),
        }
      })
      .filter((entry): entry is PortfolioHolding => entry !== null)

    results.push(...balancesFromLlama)
  } catch (e) {
    console.error('DeFiLlama balances fetch failed', e)
  }

  // 2) USDY via direct on-chain query (Ethereum mainnet)
  const usdy = CONTRACTS.USDY.address as `0x${string}`
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
      const priceResp = await axios.get(
        `https://coins.llama.fi/prices/current/ethereum:${usdy}`
      )
      const priceEntry = priceResp.data?.coins?.[`ethereum:${usdy}`]
      const price = typeof priceEntry?.price === 'number' ? priceEntry.price : 0

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

  const localPriceLookup: Record<string, number> = {}
  const priceKeys = Array.from(
    new Set(
      LOCAL_TOKENS
        .map((token) => token.priceKey)
        .filter((key): key is string => !!key && key.length > 0)
    )
  )
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
          localPriceLookup[key] = maybePrice
        }
      }
    } catch (error) {
      console.error('Local token price fetch failed', error)
    }
  }

  // 3) Local dev token(s) on Hardhat
  try {
    for (const token of LOCAL_TOKENS) {
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
        const price = priceKey.length > 0 ? localPriceLookup[priceKey] ?? 1 : 1

        results.push({
          symbol,
          balance,
          price,
          value: balance * price,
          protocol: token.protocol ?? getProtocolForSymbol(symbol),
        })
      }
    }
  } catch (e) {
    console.error('Local token read failed', e)
  }

  return results
}
