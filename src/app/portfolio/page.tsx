'use client'

import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio } from '@/lib/portfolio'

export default function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => fetchPortfolio(address!),
    enabled: !!address,
  })

  if (!isConnected) return <p className="p-8">Please connect your wallet to view your portfolio.</p>
  if (isLoading) return <p className="p-8">Loading portfolio...</p>
  if (!data || data.length === 0) return <p className="p-8">No RWA holdings found.</p>

  const total = data.reduce((sum: number, x: any) => sum + x.value, 0)

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">My Portfolio</h1>
      <p className="mb-4 text-gray-600">Wallet: {address}</p>
      <p className="mb-4 font-semibold">Total value: ${total.toFixed(2)}</p>
      <table className="min-w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-2 border">Token</th>
            <th className="px-4 py-2 border">Balance</th>
            <th className="px-4 py-2 border">Price (USD)</th>
            <th className="px-4 py-2 border">Value (USD)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item: any) => (
            <tr key={item.symbol}>
              <td className="px-4 py-2 border">{item.symbol}</td>
              <td className="px-4 py-2 border">{item.balance.toFixed(4)}</td>
              <td className="px-4 py-2 border">${item.price.toFixed(2)}</td>
              <td className="px-4 py-2 border">${item.value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
