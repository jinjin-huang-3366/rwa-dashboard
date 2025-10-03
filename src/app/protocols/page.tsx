'use client'

import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRWAProtocols, fetchRWAYields, PROTOCOL_YIELD_SOURCES } from '@/lib/defillama'
import { RISK_LEVEL_BANDS } from '@/config/risk'
import { getProtocolRiskSummary, type ProtocolRiskSummary } from '@/lib/risk'
import axios from 'axios'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type SortKey = 'tvl' | 'apy'
type SortDir = 'asc' | 'desc'

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A'
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 'N/A'
  return `$${numeric.toLocaleString()}`
}

const formatPercentage = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A'
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 'N/A'
  return `${numeric.toFixed(2)}%`
}

const normalizeUrl = (value: string | null | undefined) => {
  if (!value || typeof value !== 'string') return null

  try {
    return new URL(value).toString()
  } catch {
    try {
      return new URL(`https://${value}`).toString()
    } catch {
      return null
    }
  }
}

const calculateProjection = (amount: number, apy: number, months: number) => {
  if (!Number.isFinite(amount) || !Number.isFinite(apy) || !Number.isFinite(months)) {
    return amount
  }

  const years = months / 12
  return amount * Math.pow(1 + apy / 100, years)
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

  const riskBySlug = useMemo(() => {
    const map = {} as Record<string, ProtocolRiskSummary>

    (protocols ?? []).forEach((protocol: any) => {
      if (!protocol?.slug) return

      const summary = getProtocolRiskSummary(protocol.slug)
      if (summary) {
        map[protocol.slug] = summary
      }
    })

    return map
  }, [protocols])


  const [sortKey, setSortKey] = useState<SortKey>('tvl')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  const [scenarioAmount, setScenarioAmount] = useState(10000)
  const [scenarioMonths, setScenarioMonths] = useState(6)
  const [primaryScenarioSlug, setPrimaryScenarioSlug] = useState<string | null>('ondo-yield-assets')
  const [secondaryScenarioSlug, setSecondaryScenarioSlug] = useState<string | null>('maple')

  // new: chart state
  const [tvlHistory, setTvlHistory] = useState<any[]>([])
  const [apyHistory, setApyHistory] = useState<any[]>([])

  useEffect(() => {
    if (!selectedSlug) return

    const aliasProjects = PROTOCOL_YIELD_SOURCES[selectedSlug] ?? [selectedSlug]

    const buildTvlHistory = (protocolData: any) => {
      const totals = new Map<number, number>()

      const accumulate = (entry: any) => {
        const date = typeof entry?.date === 'number' ? entry.date : null
        if (!date) return

        let value = entry?.totalLiquidityUSD ?? entry?.totalLiquidity ?? entry?.tvl ?? entry?.tvlUsd
        if (value == null && entry?.tokens && typeof entry.tokens === 'object') {
          value = Object.values(entry.tokens).reduce((acc: number, current: any) => {
            const numeric = Number(current)
            return Number.isFinite(numeric) ? acc + numeric : acc
          }, 0)
        }

        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return

        totals.set(date, (totals.get(date) ?? 0) + numericValue)
      }

      const topLevel = Array.isArray(protocolData?.tvl) ? protocolData.tvl : []
      topLevel.forEach(accumulate)

      const chainSegments = protocolData?.chainTvls ?? {}
      Object.values(chainSegments).forEach((chain: any) => {
        const segment = Array.isArray(chain?.tvl) ? chain.tvl : []
        segment.forEach(accumulate)
      })

      return Array.from(totals.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([date, tvl]) => ({
          date: new Date(date * 1000).toLocaleDateString(),
          tvl,
        }))
    }

    const loadCharts = async () => {
      try {
        setTvlHistory([])
        setApyHistory([])

        const fetchApyHistory = async () => {
          const matchingPools = (yields ?? []).filter((entry: any) =>
            aliasProjects.includes(entry.project)
          )

          if (matchingPools.length === 0) return []

          const targetPool = matchingPools.reduce((prev: any, current: any) => {
            const prevTvl = Number(prev?.tvlUsd ?? 0)
            const currentTvl = Number(current?.tvlUsd ?? 0)
            return currentTvl > prevTvl ? current : prev
          }, matchingPools[0])

          if (!targetPool?.pool) return []

          const { data } = await axios.get(`https://yields.llama.fi/chart/${targetPool.pool}`)

          return (data?.data ?? [])
            .map((point: any) => {
              const timestamp =
                typeof point?.timestamp === 'number'
                  ? point.timestamp * 1000
                  : Date.parse(point?.timestamp ?? '')

              if (!Number.isFinite(timestamp)) return null

              const apyValue = Number(point?.apy)
              if (!Number.isFinite(apyValue)) return null

              return {
                date: new Date(timestamp).toLocaleDateString(),
                apy: apyValue,
              }
            })
            .filter(Boolean)
        }

        const [tvlResponse, apySeries] = await Promise.all([
          axios.get(`https://api.llama.fi/protocol/${selectedSlug}`),
          fetchApyHistory(),
        ])

        const tvlSeries = buildTvlHistory(tvlResponse.data)

        setTvlHistory(tvlSeries ?? [])
        setApyHistory(apySeries ?? [])
      } catch (err) {
        console.error('Chart fetch failed:', err)
        setTvlHistory([])
        setApyHistory([])
      }
    }

    loadCharts()
  }, [selectedSlug, yields])


  const combined = useMemo(() => {
    if (!protocols) return []

    return protocols.map((protocol: any) => {

      const aliases = PROTOCOL_YIELD_SOURCES[protocol.slug] ?? [protocol.slug]
      const matchingPools = (yields ?? []).filter((entry: any) =>
        aliases.includes(entry.project)
      )

      const primaryPool =
        matchingPools.length > 0
          ? matchingPools.reduce((prev: any, current: any) => {
              const prevTvl = Number(prev?.tvlUsd ?? 0)
              const currentTvl = Number(current?.tvlUsd ?? 0)
              return currentTvl > prevTvl ? current : prev
            })
          : null

      const apyValue = primaryPool?.apy
      const numericApy =
        apyValue === null || apyValue === undefined ? null : Number(apyValue)

      const tvlValue = protocol.tvl
      const numericTvl =
        tvlValue === null || tvlValue === undefined ? null : Number(tvlValue)

      return {
        ...protocol,
        apy:
          numericApy !== null && Number.isFinite(numericApy) ? numericApy : null,
        chain: primaryPool?.chain ?? protocol.chain ?? 'N/A',
        risk: riskBySlug[protocol.slug] ?? null,
        tvl:
          numericTvl !== null && Number.isFinite(numericTvl) ? numericTvl : null,
      }
    })
  }, [protocols, yields])

  const scenarioOptions = useMemo((): { slug: string; name: string; apy: number | null }[] => {
    return combined.map((entry: any) => ({
      slug: entry.slug as string,
      name: entry.name as string,
      apy: typeof entry.apy === 'number' ? entry.apy : null,
    }))
  }, [combined])

  useEffect(() => {
    if (scenarioOptions.length === 0) return

    if (!primaryScenarioSlug || !scenarioOptions.some((option) => option.slug === primaryScenarioSlug)) {
      setPrimaryScenarioSlug(scenarioOptions[0]?.slug ?? null)
    }

    if (!secondaryScenarioSlug || !scenarioOptions.some((option) => option.slug === secondaryScenarioSlug)) {
      const fallback = scenarioOptions.find((option) => option.slug !== (primaryScenarioSlug ?? ''))
      setSecondaryScenarioSlug((fallback ?? scenarioOptions[0])?.slug ?? null)
    }
  }, [primaryScenarioSlug, secondaryScenarioSlug, scenarioOptions])


  const sorted = useMemo(() => {
    if (combined.length === 0) return []
    return [...combined].sort((a, b) => {
      const aVal = sortKey === 'tvl' ? a.tvl ?? 0 : a.apy ?? 0
      const bVal = sortKey === 'tvl' ? b.tvl ?? 0 : b.apy ?? 0
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [combined, sortDir, sortKey])

  const activeSelection = useMemo(() => {
    if (!selectedSlug) return null
    return combined.find((item: any) => item.slug === selectedSlug) ?? null
  }, [combined, selectedSlug])

  const activeRisk = activeSelection?.slug
    ? riskBySlug[activeSelection.slug] ?? null
    : null

  const linkButtons = useMemo(() => {
    if (!activeSelection) return []

    const buttons: { label: string; href: string }[] = []

    const siteUrl = normalizeUrl(activeSelection.url)
    if (siteUrl) {
      buttons.push({ label: 'Visit Protocol', href: siteUrl })
    }

    const docsCandidate = Array.isArray(activeSelection.audit_links)
      ? activeSelection.audit_links.find((entry: any) => typeof entry === 'string')
      : null
    const docsUrl = normalizeUrl(docsCandidate as string | undefined)
    if (docsUrl) {
      buttons.push({ label: 'Docs', href: docsUrl })
    }

    const slug = typeof activeSelection.slug === 'string' ? activeSelection.slug : null
    if (slug) {
      const llamaUrl = `https://defillama.com/protocol/${slug}`
      const normalizedLlamaUrl = normalizeUrl(llamaUrl)
      if (normalizedLlamaUrl) {
        buttons.push({ label: 'DeFiLlama Page', href: normalizedLlamaUrl })
      }
    }

    return buttons
  }, [activeSelection])

  const scenarioPrimary = useMemo(() => {
    return scenarioOptions.find((option) => option.slug === primaryScenarioSlug) ?? null
  }, [primaryScenarioSlug, scenarioOptions])

  const scenarioSecondary = useMemo(() => {
    return scenarioOptions.find((option) => option.slug === secondaryScenarioSlug) ?? null
  }, [scenarioOptions, secondaryScenarioSlug])

  const primaryProjection = useMemo(() => {
    if (!scenarioPrimary || scenarioPrimary.apy === null) return null

    const projected = calculateProjection(Math.max(scenarioAmount, 0), scenarioPrimary.apy, Math.max(scenarioMonths, 0))
    return {
      apy: scenarioPrimary.apy,
      projected,
      gain: projected - Math.max(scenarioAmount, 0),
      name: scenarioPrimary.name,
    }
  }, [scenarioAmount, scenarioMonths, scenarioPrimary])

  const secondaryProjection = useMemo(() => {
    if (!scenarioSecondary || scenarioSecondary.apy === null) return null

    const projected = calculateProjection(Math.max(scenarioAmount, 0), scenarioSecondary.apy, Math.max(scenarioMonths, 0))
    return {
      apy: scenarioSecondary.apy,
      projected,
      gain: projected - Math.max(scenarioAmount, 0),
      name: scenarioSecondary.name,
    }
  }, [scenarioAmount, scenarioMonths, scenarioSecondary])

  const projectionDelta = useMemo(() => {
    if (!primaryProjection || !secondaryProjection) return null
    return secondaryProjection.projected - primaryProjection.projected
  }, [primaryProjection, secondaryProjection])

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
      <div className="mb-8 rounded-xl border border-gray-700 bg-[#121826] p-6 shadow">
        <h2 className="text-xl font-semibold text-white">Scenario Simulator</h2>
        <p className="mt-1 text-sm text-gray-400">Compare projected outcomes for two protocols using simple compounding based on current APYs.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Investment amount (USD)</span>
            <input
              type="number"
              min="0"
              value={scenarioAmount}
              onChange={(event) => {
                const value = Number(event.target.value)
                setScenarioAmount(Number.isFinite(value) && value >= 0 ? value : 0)
              }}
              className="rounded-md border border-gray-700 bg-[#0f1624] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Duration (months)</span>
            <input
              type="number"
              min="0"
              value={scenarioMonths}
              onChange={(event) => {
                const value = Number(event.target.value)
                setScenarioMonths(Number.isFinite(value) && value >= 0 ? value : 0)
              }}
              className="rounded-md border border-gray-700 bg-[#0f1624] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Scenario A protocol</span>
            <select
              value={primaryScenarioSlug ?? ''}
              onChange={(event) => setPrimaryScenarioSlug(event.target.value || null)}
              className="rounded-md border border-gray-700 bg-[#0f1624] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {scenarioOptions.map((option) => (
                <option key={option.slug} value={option.slug} disabled={option.apy === null}>
                  {option.name} {option.apy === null ? '(APY unavailable)' : `(${formatPercentage(option.apy)})`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            <span>Scenario B protocol</span>
            <select
              value={secondaryScenarioSlug ?? ''}
              onChange={(event) => setSecondaryScenarioSlug(event.target.value || null)}
              className="rounded-md border border-gray-700 bg-[#0f1624] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {scenarioOptions.map((option) => (
                <option key={option.slug} value={option.slug} disabled={option.apy === null}>
                  {option.name} {option.apy === null ? '(APY unavailable)' : `(${formatPercentage(option.apy)})`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-700 bg-[#1a2130] p-4">
            <h3 className="text-sm font-semibold text-gray-200">Scenario A</h3>
            {primaryProjection ? (
              <div className="mt-3 space-y-2 text-sm text-gray-300">
                <p>Protocol: {primaryProjection.name}</p>
                <p>APY: {formatPercentage(primaryProjection.apy)}</p>
                <p>Projected value: {formatCurrency(primaryProjection.projected)}</p>
                <p>Gain: {formatCurrency(primaryProjection.gain)}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">APY data unavailable for the selected protocol.</p>
            )}
          </div>
          <div className="rounded-lg border border-gray-700 bg-[#1a2130] p-4">
            <h3 className="text-sm font-semibold text-gray-200">Scenario B</h3>
            {secondaryProjection ? (
              <div className="mt-3 space-y-2 text-sm text-gray-300">
                <p>Protocol: {secondaryProjection.name}</p>
                <p>APY: {formatPercentage(secondaryProjection.apy)}</p>
                <p>Projected value: {formatCurrency(secondaryProjection.projected)}</p>
                <p>Gain: {formatCurrency(secondaryProjection.gain)}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">APY data unavailable for the selected protocol.</p>
            )}
          </div>
        </div>

        {projectionDelta !== null && (
          <p className={`mt-4 text-sm ${projectionDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {secondaryProjection?.name ?? 'Scenario B'} is {projectionDelta >= 0 ? 'ahead' : 'behind'} by {formatCurrency(Math.abs(projectionDelta))} after {scenarioMonths} month(s).
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">Projections assume constant APYs with compounding over the chosen horizon. Actual performance may vary.</p>
      </div>
      <h1 className="text-2xl font-bold mb-6">RWA Protocols</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
        <span className="font-semibold text-gray-300">Risk legend:</span>
        {RISK_LEVEL_BANDS.map((band) => (
          <span
            key={band.key}
            className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold ${band.badgeClass}`}
          >
            {band.label}
          </span>
        ))}
        <span className="text-gray-500">Scores weight audit 35%, collateral 40%, centralization 25%; lower score signals lower relative risk.</span>
      </div>
      <div className="overflow-hidden rounded-xl shadow bg-[#121826]">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-[#1a2130]">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Protocol</th>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Category</th>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Chain</th>
              <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-gray-400">Risk</th>
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
            {sorted.map((protocol: any) => {
              const risk = protocol.risk ?? riskBySlug[protocol.slug] ?? null

              return (
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
                  <td className="px-6 py-4">
                    {risk ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${risk.level.badgeClass}`}
                      >
                        {risk.level.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">{formatCurrency(protocol.tvl)}</td>
                  <td className="px-6 py-4 text-right">{formatPercentage(protocol.apy)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {activeSelection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#121826] rounded-xl shadow-xl w-full max-w-2xl relative flex max-h-[90vh] flex-col overflow-y-auto p-6">
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

            {/* Charts */}
            <div className="space-y-6">
              <div>
                <h3 className="text-gray-200 text-sm mb-2">TVL History</h3>
                {tvlHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={tvlHistory}>
                      <XAxis dataKey="date" />
                      <YAxis hide />
                      <Tooltip />
                      <Line type="monotone" dataKey="tvl" stroke="#3b82f6" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500 text-xs italic">TVL history not available.</p>
                )}
              </div>
              <div>
                <h3 className="text-gray-200 text-sm mb-2">APY History</h3>
                {apyHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={apyHistory}>
                      <XAxis dataKey="date" />
                      <YAxis hide />
                      <Tooltip />
                      <Line type="monotone" dataKey="apy" stroke="#10b981" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500 text-xs italic">APY history not available.</p>
                )}
              </div>
            </div>

            <div className="mt-6">
              {activeRisk ? (
                <div className="rounded-lg border border-gray-700 bg-[#1a2130] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">Risk level</p>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${activeRisk.level.badgeClass}`}
                    >
                      {activeRisk.level.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Composite score {activeRisk.score.toFixed(1)} (lower is safer).</p>
                  <dl className="mt-4 space-y-3 text-sm text-gray-300">
                    <div>
                      <dt className="font-semibold text-gray-200">Audit</dt>
                      <dd>{activeRisk.components.audit.label}. {activeRisk.components.audit.detail}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-200">Collateral</dt>
                      <dd>{activeRisk.components.collateral.label}. {activeRisk.components.collateral.detail}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-200">Centralization</dt>
                      <dd>{activeRisk.components.centralization.label}. {activeRisk.components.centralization.detail}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-gray-500">Scores weight audit (35%), collateral (40%), and centralization (25%). Lower scores indicate comparatively lower risk.</p>
                  {activeRisk.notes.length > 0 && (
                    <ul className="mt-4 space-y-2 text-xs text-gray-400">
                      {activeRisk.notes.map((note) => (
                        <li key={note}>- {note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-gray-700 bg-[#1a2130] p-4 text-sm text-gray-400">
                  Risk data is not available for this protocol yet.
                </div>
              )}
            </div>

            {linkButtons.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {linkButtons.map((button) => (
                  <a
                    key={button.label}
                    href={button.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md border border-blue-500/40 px-4 py-2 text-sm font-medium text-blue-400 transition hover:bg-blue-500/10"
                  >
                    {button.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


