'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRWAProtocols, fetchRWAYields } from '@/lib/defillama'

export default function ProtocolsPage() {
  const { data: protocols, isLoading: loading1 } = useQuery({
    queryKey: ['protocols'],
    queryFn: fetchRWAProtocols,
    staleTime: 0,
  })
  const { data: yields, isLoading: loading2 } = useQuery({
    queryKey: ['yields'],
    queryFn: fetchRWAYields,
  })

  useEffect(() => {
    fetchRWAProtocols().then(r =>
      console.log("DEBUG from useEffect:", r.map((p: any) => p.slug))
    )
  }, [])

  if (loading1 || loading2) return <p className="p-8 text-gray-400">Loading...</p>
  if (!protocols || !yields) return <p className="p-8 text-gray-400">No data found.</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">RWA Protocols</h1>
      <div className="overflow-hidden rounded-xl shadow bg-[#121826]">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-[#1a2130]">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Protocol</th>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Category</th>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Chain</th>
              <th className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400">TVL</th>
              <th className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400">APY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {protocols.map((p: any) => {
              const pool = yields.find((y: any) => y.project === p.slug)
              return (
                <tr key={p.slug} className="hover:bg-[#1a2130] transition-colors">
                  <td className="px-6 py-4 font-medium">{p.name}</td>
                  <td className="px-6 py-4 text-gray-300">{p.category}</td>
                  <td className="px-6 py-4 text-gray-300">{pool?.chain ?? '—'}</td>
                  <td className="px-6 py-4 text-right">${p.tvl?.toLocaleString() ?? '-'}</td>
                  <td className="px-6 py-4 text-right">{pool ? `${Number(pool.apy).toFixed(2)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
