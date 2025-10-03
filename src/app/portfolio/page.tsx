'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio, type PortfolioHolding } from '@/lib/portfolio'
import { fetchRWAProtocols } from '@/lib/defillama'
import { getProtocolRiskSummary } from '@/lib/risk'

type ProtocolSummary = {
  slug: string
  name: string
  tvl?: number
  [key: string]: unknown
}

type CurrencyFormatOptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

const formatCurrency = (
  value: number | null | undefined,
  options: CurrencyFormatOptions = {}
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00'

  const minimumFractionDigits =
    options.minimumFractionDigits ?? (value >= 1000 ? 0 : 2)
  const maximumFractionDigits =
    options.maximumFractionDigits ?? (value >= 1000 ? 0 : 2)

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value)
}

const formatTokenAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  const maximumFractionDigits = value >= 1000 ? 0 : value >= 1 ? 2 : 4

  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })
}

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return 'N/A'
  if (value === 0) return '0%'
  if (value < 0.01) return '<0.01%'
  const digits = value >= 100 ? 1 : 2
  return `${value.toFixed(digits)}%`
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: portfolio, isLoading: loadingPortfolio } = useQuery<PortfolioHolding[]>({
    queryKey: ['portfolio', address],
    queryFn: () => fetchPortfolio(address!),
    enabled: mounted && !!address,
  })

  const { data: protocols, isLoading: loadingProtocols } = useQuery<ProtocolSummary[]>({
    queryKey: ['rwa-protocols'],
    queryFn: fetchRWAProtocols,
    enabled: mounted,
    staleTime: 1000 * 60 * 5,
  })

  const protocolsBySlug = useMemo(
    () =>
      (protocols ?? []).reduce<Record<string, ProtocolSummary>>((acc, protocol) => {
        if (protocol?.slug) {
          acc[protocol.slug] = protocol
        }
        return acc
      }, {}),
    [protocols]
  )

  const enrichedHoldings = useMemo(() => {
    const source = Array.isArray(portfolio) ? portfolio : []

    return source
      .map((holding) => {
        const protocolMeta = holding.protocol
        const protocolData = protocolMeta?.slug
          ? protocolsBySlug[protocolMeta.slug]
          : undefined
        const tvl =
          typeof protocolData?.tvl === 'number' && Number.isFinite(protocolData.tvl)
            ? protocolData.tvl
            : undefined
        const value = Number.isFinite(holding.value) ? holding.value : 0
        const share = tvl && tvl > 0 && value > 0 ? (value / tvl) * 100 : null
        const slug = protocolMeta?.slug
        const risk = slug ? getProtocolRiskSummary(slug) : null

        return {
          holding,
          protocolMeta,
          protocolData,
          tvl,
          share,
          risk,
        }
      })
      .sort((a, b) => b.holding.value - a.holding.value)
  }, [portfolio, protocolsBySlug])

  const totalValue = enrichedHoldings.reduce((sum, entry) => {
    const value = Number.isFinite(entry.holding.value) ? entry.holding.value : 0
    return sum + value
  }, 0)

  if (!mounted) return <p className="p-8 text-gray-400">Loading portfolio...</p>
  if (!isConnected || !address)
    return (
      <p className="p-8 text-gray-400">
        Please connect your wallet to view your portfolio.
      </p>
    )
  if (loadingPortfolio || loadingProtocols)
    return <p className="p-8 text-gray-400">Loading portfolio...</p>
  if (!portfolio || portfolio.length === 0)
    return <p className="p-8 text-gray-400">No RWA holdings found.</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">My Portfolio</h1>
      <p className="mb-2 text-gray-400">Wallet: {address}</p>
      <p className="mb-6 font-semibold">Total value: {formatCurrency(totalValue)}</p>

      <div className="space-y-4">
        {enrichedHoldings.map(({ holding, protocolMeta, protocolData, tvl, share, risk }) => {
          const protocolName = protocolMeta?.name ?? protocolData?.name ?? holding.symbol
          const possessiveSuffix = protocolName.endsWith("'s") ? '' : "'s"
          const shareText = formatPercent(share)
          const tvlText = tvl
            ? formatCurrency(tvl, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
            : null
          const progressWidth = share !== null ? Math.min(share, 100) : 0
          const riskScoreText = risk ? risk.score.toFixed(1) : null

          return (
            <div
              key={`${holding.symbol}-${protocolMeta?.slug ?? 'unknown'}`}
              className="rounded-xl border border-gray-700 bg-[#121826] p-6 shadow"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{holding.symbol}</h2>
                  <p className="mt-1 text-gray-400">
                    You hold{' '}
                    <span className="font-semibold text-gray-200">
                      {formatTokenAmount(holding.balance)} {holding.symbol}
                    </span>
                    .
                  </p>
                  {share !== null && tvl ? (
                    <p className="mt-2 text-gray-300">
                      That's{' '}
                      <span className="font-semibold text-blue-400">{shareText}</span> of{' '}
                      {protocolName}
                      {possessiveSuffix} TVL ({tvlText}).
                    </p>
                  ) : (
                    <p className="mt-2 text-gray-500">
                      TVL data for {protocolName} is not available right now.
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-sm uppercase text-gray-500">Position value</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(holding.value)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Price per token:{' '}
                    {formatCurrency(holding.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {share !== null && (
                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Share capped at 100% for visualization. Actual share: {shareText}.
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                  Protocol: {protocolName}
                </span>
                {risk ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${risk.level.badgeClass}`}
                  >
                    Risk: {risk.level.label}
                    {riskScoreText ? (
                      <span className="text-xs font-normal text-gray-200/80">{riskScoreText}</span>
                    ) : null}
                  </span>
                ) : null}
                {tvlText ? (
                  <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                    TVL: {tvlText}
                  </span>
                ) : null}
                <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                  USD value: {formatCurrency(holding.value)}
                </span>
              </div>

              {risk ? (
                <div className="mt-6 rounded-lg border border-gray-700 bg-[#1a2130] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">Risk breakdown</p>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${risk.level.badgeClass}`}
                    >
                      {risk.level.label}
                      {riskScoreText ? (
                        <span className="ml-1 text-[11px] font-normal text-gray-200/80">({riskScoreText})</span>
                      ) : null}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm text-gray-300">
                    <div>
                      <dt className="font-semibold text-gray-200">Audit</dt>
                      <dd>{risk.components.audit.label}. {risk.components.audit.detail}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-200">Collateral</dt>
                      <dd>{risk.components.collateral.label}. {risk.components.collateral.detail}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-gray-200">Centralization</dt>
                      <dd>{risk.components.centralization.label}. {risk.components.centralization.detail}</dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-xs text-gray-500">Scores weight audit (35%), collateral (40%), and centralization (25%). Lower scores indicate comparatively lower risk.</p>
                  {risk.notes.length > 0 && (
                    <ul className="mt-4 space-y-2 text-xs text-gray-400">
                      {risk.notes.map((note) => (
                        <li key={note}>- {note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
