import axios from 'axios'
import { createPublicClient, http } from 'viem'
import { mainnet, hardhat } from 'viem/chains'
import { CONTRACTS, RWA_TOKENS, LOCAL_TOKENS } from '@/config/tokens'
import { balanceOfAbi, decimalsAbi, symbolAbi } from '@/config/erc20Abi'

// client for Ethereum mainnet
const client = createPublicClient({ chain: mainnet, transport: http() })
// client for local Hardhat dev chain
const localClient = createPublicClient({ chain: hardhat, transport: http() })

export async function fetchPortfolio(address: string) {
  let results: any[] = []

  // 1) Generic ERC-20s via DeFiLlama balances API
  const url = `https://coins.llama.fi/balances?address=${address}&chain=ethereum`
  try {
    const { data } = await axios.get(url)

    if (data?.coins) {
      const balances = Object.entries<any>(data.coins)
        .filter(([_k, coin]) =>
          RWA_TOKENS.some((t) => coin.symbol?.toUpperCase().includes(t))
        )
        .map(([_k, coin]) => {
          const bal = coin.balance / 10 ** coin.decimals
          return {
            symbol: coin.symbol,
            balance: bal,
            price: coin.price,
            value: bal * coin.price,
          }
        })
      results = results.concat(balances)
    }
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
    const symbol = await client.readContract({
      address: usdy,
      abi: symbolAbi,
      functionName: 'symbol',
    })

    const balance = Number(rawBalance) / 10 ** Number(decimals)
    if (balance > 0) {
      const priceResp = await axios.get(
        `https://coins.llama.fi/prices/current/ethereum:${usdy}`
      )
      const price = priceResp.data.coins[`ethereum:${usdy}`].price
      results.push({ symbol, balance, price, value: balance * price })
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
      const symbol = await localClient.readContract({
        address: token.address as `0x${string}`,
        abi: symbolAbi,
        functionName: 'symbol',
      })

      const balance = Number(rawBalance) / 10 ** Number(decimals)
      if (balance > 0) {
        const priceKey = token.priceKey ?? ''
        const price = localPriceLookup[priceKey] ?? 1
        results.push({ symbol, balance, price, value: balance * price })
      }
    }
  } catch (e) {
    console.error('Local token read failed', e)
  }

  return results
}
