'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio } from '@/lib/portfolio'

export default function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => fetchPortfolio(address!),
    enabled: mounted && !!address,
  })

  if (!mounted) return <p className="p-8 text-gray-400">Loading portfolio...</p>
  if (!isConnected) return <p className="p-8 text-gray-400">Please connect your wallet to view your portfolio.</p>
  if (isLoading) return <p className="p-8 text-gray-400">Loading portfolio...</p>
  if (!data || data.length === 0) return <p className="p-8 text-gray-400">No RWA holdings found.</p>

  const total = data.reduce((sum: number, x: any) => sum + x.value, 0)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Portfolio</h1>
      <p className="mb-2 text-gray-400">Wallet: {address}</p>
      <p className="mb-6 font-semibold">Total value: ${total.toFixed(2)}</p>

      <div className="overflow-hidden rounded-xl shadow bg-[#121826]">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-[#1a2130]">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Token</th>
              <th className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400">Balance</th>
              <th className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400">Price</th>
              <th className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.map((item: any) => (
              <tr key={item.symbol} className="hover:bg-[#1a2130] transition-colors">
                <td className="px-6 py-4 font-medium text-lg">{item.symbol}</td>
                <td className="px-6 py-4 text-right">{item.balance.toFixed(4)}</td>
                <td className="px-6 py-4 text-right">${item.price.toFixed(2)}</td>
                <td className="px-6 py-4 text-right font-semibold">
                  ${(item.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
