'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRWAProtocols, fetchRWAYields } from '@/lib/defillama'

type SortKey = 'tvl' | 'apy'
type SortDir = 'asc' | 'desc'

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  const numeric = Number(value)
  if (Number.isNaN(numeric)) {
    return 'N/A'
  }

  return `$${numeric.toLocaleString()}`
}

const formatPercentage = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  const numeric = Number(value)
  if (Number.isNaN(numeric)) {
    return 'N/A'
  }

  return `${numeric.toFixed(2)}%`
}

export default function ProtocolsPage() {
  const { data: protocols, isLoading: loadingProtocols } = useQuery({
    queryKey: ['protocols'],
    queryFn: fetchRWAProtocols,
    staleTime: 0,
  })

  const { data: yields, isLoading: loadingYields } = useQuery({
    queryKey: ['yields'],
    queryFn: fetchRWAYields,
  })

  const [sortKey, setSortKey] = useState<SortKey>('tvl')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const combined = useMemo(() => {
    if (!protocols) {
      return []
    }

    return protocols.map((protocol: any) => {
      const pool = yields?.find((entry: any) => entry.project === protocol.slug)
      const apyValue = pool?.apy
      const numericApy =
        apyValue === null || apyValue === undefined ? null : Number(apyValue)

      const tvlValue = protocol.tvl
      const numericTvl =
        tvlValue === null || tvlValue === undefined ? null : Number(tvlValue)

      return {
        ...protocol,
        apy:
          numericApy !== null && Number.isFinite(numericApy) ? numericApy : null,
        chain: pool?.chain ?? 'N/A',
        tvl:
          numericTvl !== null && Number.isFinite(numericTvl) ? numericTvl : null,
      }
    })
  }, [protocols, yields])

  const sorted = useMemo(() => {
    if (combined.length === 0) {
      return []
    }

    return [...combined].sort((a, b) => {
      const aVal = sortKey === 'tvl' ? a.tvl ?? 0 : a.apy ?? 0
      const bVal = sortKey === 'tvl' ? b.tvl ?? 0 : b.apy ?? 0
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [combined, sortDir, sortKey])

  const activeSelection = useMemo(() => {
    if (!selectedSlug) {
      return null
    }

    return combined.find((item: any) => item.slug === selectedSlug) ?? null
  }, [combined, selectedSlug])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const getSortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? '^' : 'v') : ''

  if (loadingProtocols || loadingYields) {
    return <p className="p-8 text-gray-400">Loading...</p>
  }

  if (sorted.length === 0) {
    return <p className="p-8 text-gray-400">No data found.</p>
  }

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
              <th
                className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400 cursor-pointer"
                onClick={() => toggleSort('tvl')}
              >
                TVL {getSortIndicator('tvl')}
              </th>
              <th
                className="px-6 py-3 text-right text-sm font-semibold uppercase tracking-wider text-gray-400 cursor-pointer"
                onClick={() => toggleSort('apy')}
              >
                APY {getSortIndicator('apy')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map((protocol: any) => (
              <tr
                key={protocol.slug}
                className="hover:bg-[#1a2130] transition-colors cursor-pointer"
                onClick={() => setSelectedSlug(protocol.slug)}
              >
                <td className="px-6 py-4 font-medium flex items-center gap-3">
                  {protocol.logo ? (
                    <img src={protocol.logo} alt={protocol.name} className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-600" />
                  )}
                  {protocol.name}
                </td>
                <td className="px-6 py-4 text-gray-300">{protocol.category}</td>
                <td className="px-6 py-4 text-gray-300">{protocol.chain ?? 'N/A'}</td>
                <td className="px-6 py-4 text-right">{formatCurrency(protocol.tvl)}</td>
                <td className="px-6 py-4 text-right">{formatPercentage(protocol.apy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeSelection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#121826] rounded-xl shadow-xl p-6 w-full max-w-lg relative">
            <button
              className="absolute top-3 right-3 text-gray-400 hover:text-white"
              onClick={() => setSelectedSlug(null)}
            >
              Close
            </button>
            <div className="flex items-center gap-3 mb-4">
              {activeSelection.logo ? (
                <img src={activeSelection.logo} alt={activeSelection.name} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-600" />
              )}
              <h2 className="text-xl font-bold">{activeSelection.name}</h2>
            </div>
            <p className="text-gray-400 mb-2">Category: {activeSelection.category}</p>
            <p className="text-gray-400 mb-2">Chain: {activeSelection.chain ?? 'N/A'}</p>
            <p className="text-gray-400 mb-4">TVL: {formatCurrency(activeSelection.tvl)}</p>
            <p className="text-gray-400 mb-4">APY: {formatPercentage(activeSelection.apy)}</p>

            <div className="mt-4 p-4 bg-[#1a2130] rounded-lg">
              <p className="text-gray-300 text-sm">Risk Level: <span className="font-semibold text-yellow-400">Medium</span></p>
              <p className="text-gray-300 text-sm mt-2">Collateral: Treasury bills / Credit pools (data TBD)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
