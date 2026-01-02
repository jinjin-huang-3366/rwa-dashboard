'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

type AlertSeverity = 'high' | 'medium' | 'low'

type AlertCategory =
  | 'risk'
  | 'concentration'
  | 'protocol-share'
  | 'leverage'
  | 'pricing'
  | 'data'

type PortfolioAlert = {
  id: string
  severity: AlertSeverity
  category: AlertCategory
  title: string
  detail: string
}

type AlertPreferences = {
  concentrationThreshold: number
  protocolShareThreshold: number
  borrowedRatioThreshold: number
  includeModerateRisk: boolean
  includeDataGaps: boolean
}

type NotificationPreferences = {
  enabled: boolean
  levels: Record<AlertSeverity, boolean>
}

type NotificationStatus = 'default' | 'granted' | 'denied' | 'unsupported'

const ALERT_PREFERENCES_STORAGE_KEY = 'rwa.alert-preferences.v1'
const NOTIFICATION_PREFERENCES_STORAGE_KEY = 'rwa.alert-notifications.v1'

const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  concentrationThreshold: 30,
  protocolShareThreshold: 10,
  borrowedRatioThreshold: 70,
  includeModerateRisk: true,
  includeDataGaps: true,
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  levels: {
    high: true,
    medium: false,
    low: false,
  },
}

const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  high: 'High',
  medium: 'Moderate',
  low: 'Low',
}

const ALERT_CONTAINER_CLASSES: Record<AlertSeverity, string> = {
  high: 'border-red-400/50 bg-red-500/10',
  medium: 'border-amber-400/50 bg-amber-500/10',
  low: 'border-sky-400/50 bg-sky-500/10',
}

const ALERT_BADGE_CLASSES: Record<AlertSeverity, string> = {
  high: 'border-red-400/60 text-red-200 bg-red-500/10',
  medium: 'border-amber-400/60 text-amber-200 bg-amber-500/10',
  low: 'border-sky-400/60 text-sky-200 bg-sky-500/10',
}

const ALERT_DOT_CLASSES: Record<AlertSeverity, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-sky-400',
}

const clampPercent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, 0), 100)
}

const normalizeAlertPreferences = (value: unknown): AlertPreferences => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ALERT_PREFERENCES
  }

  const candidate = value as Partial<AlertPreferences>

  return {
    concentrationThreshold: clampPercent(
      Number(candidate.concentrationThreshold),
      DEFAULT_ALERT_PREFERENCES.concentrationThreshold
    ),
    protocolShareThreshold: clampPercent(
      Number(candidate.protocolShareThreshold),
      DEFAULT_ALERT_PREFERENCES.protocolShareThreshold
    ),
    borrowedRatioThreshold: clampPercent(
      Number(candidate.borrowedRatioThreshold),
      DEFAULT_ALERT_PREFERENCES.borrowedRatioThreshold
    ),
    includeModerateRisk:
      typeof candidate.includeModerateRisk === 'boolean'
        ? candidate.includeModerateRisk
        : DEFAULT_ALERT_PREFERENCES.includeModerateRisk,
    includeDataGaps:
      typeof candidate.includeDataGaps === 'boolean'
        ? candidate.includeDataGaps
        : DEFAULT_ALERT_PREFERENCES.includeDataGaps,
  }
}

const normalizeNotificationPreferences = (
  value: unknown
): NotificationPreferences => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }

  const candidate = value as Partial<NotificationPreferences>
  const levelsCandidate = candidate.levels ?? {}

  return {
    enabled:
      typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : DEFAULT_NOTIFICATION_PREFERENCES.enabled,
    levels: {
      high:
        typeof levelsCandidate.high === 'boolean'
          ? levelsCandidate.high
          : DEFAULT_NOTIFICATION_PREFERENCES.levels.high,
      medium:
        typeof levelsCandidate.medium === 'boolean'
          ? levelsCandidate.medium
          : DEFAULT_NOTIFICATION_PREFERENCES.levels.medium,
      low:
        typeof levelsCandidate.low === 'boolean'
          ? levelsCandidate.low
          : DEFAULT_NOTIFICATION_PREFERENCES.levels.low,
    },
  }
}

const toAlertKey = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
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
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(
    DEFAULT_ALERT_PREFERENCES
  )
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatus>('default')
  const notifiedAlertIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    setMounted(true)

    if (typeof window === 'undefined') return

    const storedAlerts = window.localStorage.getItem(ALERT_PREFERENCES_STORAGE_KEY)
    if (storedAlerts) {
      try {
        setAlertPreferences(normalizeAlertPreferences(JSON.parse(storedAlerts)))
      } catch (error) {
        console.warn('Alert preferences failed to load', error)
      }
    }

    const storedNotifications = window.localStorage.getItem(
      NOTIFICATION_PREFERENCES_STORAGE_KEY
    )
    if (storedNotifications) {
      try {
        setNotificationPreferences(
          normalizeNotificationPreferences(JSON.parse(storedNotifications))
        )
      } catch (error) {
        console.warn('Notification preferences failed to load', error)
      }
    }

    if ('Notification' in window) {
      setNotificationStatus(Notification.permission)
    } else {
      setNotificationStatus('unsupported')
    }
  }, [])

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    window.localStorage.setItem(
      ALERT_PREFERENCES_STORAGE_KEY,
      JSON.stringify(alertPreferences)
    )
  }, [alertPreferences, mounted])

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return
    window.localStorage.setItem(
      NOTIFICATION_PREFERENCES_STORAGE_KEY,
      JSON.stringify(notificationPreferences)
    )
  }, [notificationPreferences, mounted])

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

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      setNotificationStatus(permission)
    } catch (error) {
      console.warn('Notification permission request failed', error)
    }
  }

  const sendTestNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationStatus !== 'granted') return

    new Notification('RWA alerts enabled', {
      body: 'You will receive portfolio risk alerts as they trigger.',
      icon: '/logo.svg',
      tag: 'rwa-alerts-test',
    })
  }

  const alerts = useMemo(() => {
    const results: PortfolioAlert[] = []
    const severityRank: Record<AlertSeverity, number> = {
      high: 0,
      medium: 1,
      low: 2,
    }

    const thresholdConcentration = clampPercent(
      alertPreferences.concentrationThreshold,
      DEFAULT_ALERT_PREFERENCES.concentrationThreshold
    )
    const thresholdProtocolShare = clampPercent(
      alertPreferences.protocolShareThreshold,
      DEFAULT_ALERT_PREFERENCES.protocolShareThreshold
    )
    const thresholdBorrowedRatio = clampPercent(
      alertPreferences.borrowedRatioThreshold,
      DEFAULT_ALERT_PREFERENCES.borrowedRatioThreshold
    )

    enrichedHoldings.forEach((entry) => {
      const protocolName =
        entry.protocolMeta?.name ?? entry.protocolData?.name ?? entry.holding.symbol
      const protocolSlug =
        entry.protocolMeta?.slug ??
        entry.protocolData?.slug ??
        entry.holding.symbol
      const baseKey = toAlertKey(`${protocolSlug}-${entry.holding.symbol}`)

      if (entry.risk) {
        if (entry.risk.level.key === 'high') {
          results.push({
            id: `risk-high-${baseKey}`,
            severity: 'high',
            category: 'risk',
            title: `${protocolName} is high risk`,
            detail: `Risk score ${entry.risk.score.toFixed(
              1
            )}. Review audit status, collateral, and governance controls.`,
          })
        } else if (
          entry.risk.level.key === 'moderate' &&
          alertPreferences.includeModerateRisk
        ) {
          results.push({
            id: `risk-moderate-${baseKey}`,
            severity: 'medium',
            category: 'risk',
            title: `${protocolName} is moderate risk`,
            detail: `Risk score ${entry.risk.score.toFixed(
              1
            )}. Monitor protocol updates and collateral performance.`,
          })
        }
      } else if (alertPreferences.includeDataGaps) {
        results.push({
          id: `risk-missing-${baseKey}`,
          severity: 'low',
          category: 'data',
          title: `Risk profile missing for ${protocolName}`,
          detail: 'Risk scoring data is unavailable for this protocol.',
        })
      }

      if (
        entry.portfolioShare !== null &&
        entry.portfolioShare >= thresholdConcentration
      ) {
        const severity: AlertSeverity =
          entry.portfolioShare >= Math.max(thresholdConcentration * 1.5, 50)
            ? 'high'
            : 'medium'

        results.push({
          id: `concentration-${baseKey}`,
          severity,
          category: 'concentration',
          title: `Concentration in ${entry.holding.symbol}`,
          detail: `${formatPercent(entry.portfolioShare)} of your portfolio is in ${
            entry.holding.symbol
          }. Consider rebalancing to reduce concentration risk.`,
        })
      }

      if (
        entry.protocolShare !== null &&
        entry.protocolShare >= thresholdProtocolShare
      ) {
        const rawShare =
          entry.protocolShareCapped && entry.protocolRawShare !== null
            ? entry.protocolRawShare
            : entry.protocolShare
        const shareLabel = rawShare !== null ? formatPercent(rawShare) : 'N/A'
        const basisLabel =
          entry.shareBasis === 'tvl+borrowed' ? 'TVL + borrowed' : 'TVL'
        const severity: AlertSeverity =
          rawShare !== null && rawShare >= thresholdProtocolShare * 2
            ? 'high'
            : 'medium'

        results.push({
          id: `protocol-share-${baseKey}`,
          severity,
          category: 'protocol-share',
          title: `${protocolName} exposure is large vs ${basisLabel}`,
          detail: `Your position equals about ${shareLabel} of tracked ${basisLabel}.`,
        })
      }

      if (
        entry.borrowed !== null &&
        entry.tvl !== null &&
        entry.tvl > 0 &&
        entry.borrowed >= 0
      ) {
        const borrowedRatio = (entry.borrowed / entry.tvl) * 100
        if (borrowedRatio >= thresholdBorrowedRatio) {
          const severity: AlertSeverity =
            borrowedRatio >= Math.max(thresholdBorrowedRatio * 1.25, 90)
              ? 'high'
              : 'medium'
          results.push({
            id: `borrowed-ratio-${baseKey}`,
            severity,
            category: 'leverage',
            title: `${protocolName} leverage is elevated`,
            detail: `Borrowed value is ${formatPercent(
              borrowedRatio
            )} of TVL.`,
          })
        }
      } else if (alertPreferences.includeDataGaps && entry.tvl === null) {
        results.push({
          id: `tvl-missing-${baseKey}`,
          severity: 'low',
          category: 'data',
          title: `TVL data missing for ${protocolName}`,
          detail: 'Protocol TVL is unavailable, limiting size and liquidity checks.',
        })
      }

      if (!Number.isFinite(entry.holding.price) || entry.holding.price <= 0) {
        results.push({
          id: `pricing-missing-${baseKey}`,
          severity: 'low',
          category: 'pricing',
          title: `Price feed missing for ${entry.holding.symbol}`,
          detail: 'Portfolio value may be understated until pricing data is available.',
        })
      }
    })

    return results.sort((a, b) => {
      const rankDelta = severityRank[a.severity] - severityRank[b.severity]
      if (rankDelta !== 0) return rankDelta
      return a.title.localeCompare(b.title)
    })
  }, [alertPreferences, enrichedHoldings])

  const alertSummary = useMemo(() => {
    return alerts.reduce(
      (acc, alert) => {
        acc[alert.severity] += 1
        return acc
      },
      { high: 0, medium: 0, low: 0 }
    )
  }, [alerts])

  const notificationsEnabled =
    notificationStatus === 'granted' && notificationPreferences.enabled

  useEffect(() => {
    if (!notificationsEnabled) return
    if (typeof window === 'undefined' || !('Notification' in window)) return

    const activeIds = new Set(alerts.map((alert) => alert.id))
    notifiedAlertIds.current.forEach((id) => {
      if (!activeIds.has(id)) {
        notifiedAlertIds.current.delete(id)
      }
    })

    const newAlerts = alerts.filter(
      (alert) =>
        notificationPreferences.levels[alert.severity] &&
        !notifiedAlertIds.current.has(alert.id)
    )

    newAlerts.forEach((alert) => {
      new Notification(`RWA ${ALERT_SEVERITY_LABELS[alert.severity]} alert`, {
        body: alert.detail,
        icon: '/logo.svg',
        tag: alert.id,
      })
      notifiedAlertIds.current.add(alert.id)
    })
  }, [alerts, notificationsEnabled, notificationPreferences.levels])

  const notificationStatusLabel = (() => {
    switch (notificationStatus) {
      case 'granted':
        return 'Granted'
      case 'denied':
        return 'Denied'
      case 'unsupported':
        return 'Not supported'
      default:
        return 'Not enabled'
    }
  })()

  const notificationStatusMeta = (() => {
    switch (notificationStatus) {
      case 'granted':
        return {
          text: 'Browser permission granted. Alerts can be delivered when enabled.',
          className: 'text-emerald-300',
        }
      case 'denied':
        return {
          text: 'Notifications are blocked in your browser settings.',
          className: 'text-red-300',
        }
      case 'unsupported':
        return {
          text: 'This browser does not support desktop notifications.',
          className: 'text-gray-500',
        }
      default:
        return {
          text: 'Click Enable to request notification permission.',
          className: 'text-gray-500',
        }
    }
  })()

  const showTestNotification = process.env.NODE_ENV !== 'production'

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

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-xl border border-gray-700 bg-[#121826] p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Risk alerts</h2>
              <p className="mt-1 text-xs text-gray-400">
                Signals blend protocol risk, concentration, and leverage checks.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(Object.keys(ALERT_SEVERITY_LABELS) as AlertSeverity[]).map(
                (severity) => (
                  <span
                    key={severity}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 ${ALERT_BADGE_CLASSES[severity]}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${ALERT_DOT_CLASSES[severity]}`} />
                    {ALERT_SEVERITY_LABELS[severity]} {alertSummary[severity]}
                  </span>
                )
              )}
            </div>
          </div>

          {alerts.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`flex flex-wrap gap-3 rounded-lg border px-4 py-3 ${ALERT_CONTAINER_CLASSES[alert.severity]}`}
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ALERT_DOT_CLASSES[alert.severity]}`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{alert.title}</p>
                    <p className="mt-1 text-xs text-gray-200/80">{alert.detail}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${ALERT_BADGE_CLASSES[alert.severity]}`}
                  >
                    {ALERT_SEVERITY_LABELS[alert.severity]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-gray-500">
              No alerts are triggered for this portfolio right now.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-700 bg-[#121826] p-6 shadow">
            <h2 className="text-lg font-semibold text-white">Notifications</h2>
            <p className="mt-1 text-xs text-gray-400">
              Enable browser alerts for new portfolio risk signals.
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>Status: {notificationStatusLabel}</span>
              <button
                type="button"
                onClick={requestNotificationPermission}
                disabled={notificationStatus === 'granted' || notificationStatus === 'unsupported'}
                className="rounded-md border border-blue-500/40 px-3 py-1 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enable
              </button>
            </div>
            <p className={`mt-2 text-xs ${notificationStatusMeta.className}`}>
              {notificationStatusMeta.text}
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={notificationPreferences.enabled}
                onChange={(event) =>
                  setNotificationPreferences((prev) => ({
                    ...prev,
                    enabled: event.target.checked,
                  }))
                }
                disabled={notificationStatus !== 'granted'}
                className="h-4 w-4 rounded border-gray-600 bg-[#0f1624] text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
              Send desktop notifications
            </label>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {(Object.keys(ALERT_SEVERITY_LABELS) as AlertSeverity[]).map(
                (severity) => (
                  <label
                    key={severity}
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1 ${ALERT_BADGE_CLASSES[severity]}`}
                  >
                    <input
                      type="checkbox"
                      checked={notificationPreferences.levels[severity]}
                      onChange={(event) =>
                        setNotificationPreferences((prev) => ({
                          ...prev,
                          levels: {
                            ...prev.levels,
                            [severity]: event.target.checked,
                          },
                        }))
                      }
                      disabled={notificationStatus !== 'granted'}
                      className="h-3.5 w-3.5 rounded border-gray-600 bg-[#0f1624] text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed"
                    />
                    {ALERT_SEVERITY_LABELS[severity]}
                  </label>
                )
              )}
            </div>
            {showTestNotification ? (
              <button
                type="button"
                onClick={sendTestNotification}
                disabled={!notificationsEnabled}
                className="mt-3 w-full rounded-md border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-blue-500/60 hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send test notification
              </button>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-700 bg-[#121826] p-6 shadow">
            <h2 className="text-lg font-semibold text-white">Alert thresholds</h2>
            <p className="mt-1 text-xs text-gray-400">
              Adjust when concentration and leverage alerts trigger.
            </p>
            <div className="mt-4 space-y-3 text-xs text-gray-400">
              <label className="flex items-center justify-between gap-3">
                <span>Portfolio concentration</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={alertPreferences.concentrationThreshold}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setAlertPreferences((prev) => ({
                        ...prev,
                        concentrationThreshold: clampPercent(
                          value,
                          prev.concentrationThreshold
                        ),
                      }))
                    }}
                    className="w-20 rounded-md border border-gray-700 bg-[#0f1624] px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Protocol share</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={alertPreferences.protocolShareThreshold}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setAlertPreferences((prev) => ({
                        ...prev,
                        protocolShareThreshold: clampPercent(
                          value,
                          prev.protocolShareThreshold
                        ),
                      }))
                    }}
                    className="w-20 rounded-md border border-gray-700 bg-[#0f1624] px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Borrowed ratio</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={alertPreferences.borrowedRatioThreshold}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setAlertPreferences((prev) => ({
                        ...prev,
                        borrowedRatioThreshold: clampPercent(
                          value,
                          prev.borrowedRatioThreshold
                        ),
                      }))
                    }}
                    className="w-20 rounded-md border border-gray-700 bg-[#0f1624] px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <span>%</span>
                </div>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertPreferences.includeModerateRisk}
                  onChange={(event) =>
                    setAlertPreferences((prev) => ({
                      ...prev,
                      includeModerateRisk: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-600 bg-[#0f1624] text-blue-500 focus:ring-blue-500"
                />
                Include moderate risk signals
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={alertPreferences.includeDataGaps}
                  onChange={(event) =>
                    setAlertPreferences((prev) => ({
                      ...prev,
                      includeDataGaps: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-600 bg-[#0f1624] text-blue-500 focus:ring-blue-500"
                />
                Include data gap alerts
              </label>
            </div>
          </div>
        </div>
      </div>

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

