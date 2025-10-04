'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { fetchPortfolio, type PortfolioHolding } from '@/lib/portfolio'
import { ResponsiveContainer, PieChart, Pie, Tooltip as RechartsTooltip, Legend, Cell } from 'recharts'
import { fetchRWAProtocols, extractBorrowedValue } from '@/lib/defillama'
import { getProtocolRiskSummary } from '@/lib/risk'

type ProtocolSummary = {
  slug: string
  name: string
  tvl?: number
  borrowed?: number
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

  const baseHoldings = useMemo(() => {
    const source = Array.isArray(portfolio) ? portfolio : []

    return source.map((holding) => {
      const protocolMeta = holding.protocol
      const protocolData = protocolMeta?.slug
        ? protocolsBySlug[protocolMeta.slug]
        : undefined
      const tvl =
        typeof protocolData?.tvl === 'number' && Number.isFinite(protocolData.tvl)
          ? protocolData.tvl
          : null
      const borrowedDirect =
        typeof protocolData?.borrowed === 'number' && Number.isFinite(protocolData.borrowed)
          ? protocolData.borrowed
          : null
      const borrowedFallback = extractBorrowedValue(protocolData)
      const borrowed =
        borrowedDirect ??
        (typeof borrowedFallback === 'number' && Number.isFinite(borrowedFallback)
          ? borrowedFallback
          : null)
      const value = Number.isFinite(holding.value) ? holding.value : 0
      const slug = protocolMeta?.slug
      const risk = slug ? getProtocolRiskSummary(slug) : null

      return {
        holding,
        protocolMeta,
        protocolData,
        tvl,
        borrowed,
        value,
        risk,
      }
    })
  }, [portfolio, protocolsBySlug])

  const totalValue = useMemo(() => {
    return baseHoldings.reduce((sum, entry) => sum + entry.value, 0)
  }, [baseHoldings])

  const enrichedHoldings = useMemo(() => {
    return baseHoldings
      .map((entry) => {
        const shareBasis: 'tvl' | 'tvl+borrowed' =
          entry.borrowed && entry.borrowed > 0 ? 'tvl+borrowed' : 'tvl'
        const denominator =
          shareBasis === 'tvl+borrowed'
            ? (entry.tvl ?? 0) + (entry.borrowed ?? 0)
            : entry.tvl ?? 0
        const protocolRawShare =
          denominator > 0 && entry.value > 0 ? (entry.value / denominator) * 100 : null
        const protocolShare =
          protocolRawShare !== null ? Math.min(protocolRawShare, 100) : null
        const protocolShareCapped =
          protocolRawShare !== null && protocolShare !== null
            ? protocolRawShare > protocolShare
            : false
        const portfolioShare =
          totalValue > 0 && entry.value > 0 ? (entry.value / totalValue) * 100 : null

        return {
          ...entry,
          shareBasis,
          shareDenominator: denominator > 0 ? denominator : null,
          protocolRawShare,
          protocolShare,
          protocolShareCapped,
          portfolioShare,
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [baseHoldings, totalValue])

  const chartColors = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#14b8a6']

  const chartData = useMemo(
    () =>
      enrichedHoldings.map((entry, index) => ({
        name: entry.holding.symbol,
        value: entry.portfolioShare ?? 0,
        usdValue: Number.isFinite(entry.holding.value) ? entry.holding.value : 0,
        fill: chartColors[index % chartColors.length],
      })),
    [enrichedHoldings]
  )

  const hasChartData = chartData.some((entry) => entry.value > 0)

  const renderCompositionTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null
    const data = payload[0]?.payload ?? {}
    const percentValue = typeof data.value === 'number' ? data.value : null
    const usdValue = typeof data.usdValue === 'number' ? data.usdValue : null
    const displayLabel =
      typeof label === 'string' && label.length > 0
        ? label
        : typeof data.name === 'string'
        ? data.name
        : 'Holding'

    return (
      <div className="rounded-md border border-gray-700 bg-[#0f172a] px-3 py-2 text-xs text-gray-200">
        <p className="font-semibold">{displayLabel}</p>
        <p>{percentValue !== null ? formatPercent(percentValue) : 'N/A'} of portfolio</p>
        <p>{formatCurrency(usdValue ?? null)}</p>
      </div>
    )
  }


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

      {hasChartData ? (
        <div className="mb-6 rounded-xl border border-gray-700 bg-[#121826] p-6 shadow">
          <h2 className="text-lg font-semibold text-white">Portfolio composition</h2>
          <p className="mt-1 text-sm text-gray-400">Share of each holding by USD value.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={`slice-${entry.name}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip content={renderCompositionTooltip} />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  formatter={(value: string, legendEntry: any) => {
                    const percentValue =
                      legendEntry?.payload && typeof legendEntry.payload.value === 'number'
                        ? formatPercent(legendEntry.payload.value)
                        : 'N/A'
                    return `${value} (${percentValue})`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {enrichedHoldings.map(
          ({
            holding,
            protocolMeta,
            protocolData,
            tvl,
            borrowed,
            shareBasis,
            shareDenominator,
            protocolRawShare,
            protocolShare,
            protocolShareCapped,
            portfolioShare,
            risk,
          }) => {
            const protocolName = protocolMeta?.name ?? protocolData?.name ?? holding.symbol
            const possessiveSuffix = protocolName.endsWith("'s") ? '' : "'s"
            const hasPortfolioShare = portfolioShare !== null
            const portfolioShareText = hasPortfolioShare ? formatPercent(portfolioShare) : null
            const portfolioProgress = hasPortfolioShare ? Math.min(portfolioShare, 100) : 0
            const hasProtocolShare = protocolShare !== null
            const protocolShareText = hasProtocolShare
              ? protocolShareCapped
                ? '100%+'
                : formatPercent(protocolShare)
              : null
            const protocolRawShareText =
              protocolShareCapped && protocolRawShare !== null ? formatPercent(protocolRawShare) : null
            const shareBasisLabel =
              shareBasis === 'tvl+borrowed'
                ? 'DeFiLlama TVL + borrowed capital'
                : 'current DeFiLlama TVL'
            const protocolShareNote = (() => {
              if (!hasProtocolShare) return null
              if (protocolShareCapped) {
                return protocolRawShareText
                  ? `Relative to ${shareBasisLabel}: capped at 100% (raw ${protocolRawShareText}).`
                  : `Relative to ${shareBasisLabel}: capped at 100%.`
              }
              return `Relative to ${shareBasisLabel}: ${protocolShareText}.`
            })()
            const trackedValueText =
              shareDenominator !== null
                ? formatCurrency(shareDenominator, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                : null
            const tvlText =
              typeof tvl === 'number'
                ? formatCurrency(tvl, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                : null
            const borrowedText =
              typeof borrowed === 'number'
                ? formatCurrency(borrowed, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                : null
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
                    {hasPortfolioShare ? (
                      <p className="mt-2 text-gray-300">
                        That's{' '}
                        <span className="font-semibold text-blue-400">{portfolioShareText}</span> of your total RWA portfolio.
                      </p>
                    ) : (
                      <p className="mt-2 text-gray-500">
                        We couldn't calculate your portfolio share yet.
                      </p>
                    )}
                    {trackedValueText ? (
                      <p className="mt-1 text-xs text-gray-500">
                        {shareBasisLabel}: {trackedValueText}.
                      </p>
                    ) : null}
                    {tvlText ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Latest DeFiLlama TVL: {tvlText}.
                      </p>
                    ) : null}
                    {borrowedText ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Latest DeFiLlama borrowed: {borrowedText}.
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-sm uppercase text-gray-500">Position value</p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(holding.value)}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Price per token:{' '}
                      {formatCurrency(holding.price, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                {hasPortfolioShare ? (
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${portfolioProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Share of your total portfolio value.</p>
                    {protocolShareNote ? (
                      <p className="mt-1 text-xs text-gray-500">{protocolShareNote}</p>
                    ) : null}
                  </div>
                ) : protocolShareNote ? (
                  <p className="mt-4 text-xs text-gray-500">{protocolShareNote}</p>
                ) : null}

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
                  {hasPortfolioShare && portfolioShareText ? (
                    <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                      Portfolio share: {portfolioShareText}
                    </span>
                  ) : null}
                  {protocolShareText ? (
                    <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                      Protocol share: {protocolShareText}
                    </span>
                  ) : null}
                  {tvlText ? (
                    <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                      TVL: {tvlText}
                    </span>
                  ) : null}
                  {borrowedText ? (
                    <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                      Borrowed: {borrowedText}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-[#1a2130] px-3 py-1 text-gray-300">
                    USD value: {formatCurrency(holding.value)}
                  </span>
                </div>

                {risk ? (
                  <div className="mt-6 rounded-lg border border-gray-700 bg-[#121826] p-4">
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
          }
        )}
      </div>
    </div>
  )
}

