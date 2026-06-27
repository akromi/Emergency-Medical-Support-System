import type { VitalSign } from '@triage-link/core'
import { useLang } from '../i18n'

// Compact per-metric sparklines over the logged vitals — deterioration at a
// glance for the receiving clinician. Vitals are free-text strings; parseVital
// pulls the primary number from each (systolic for "120/80", total for the
// "12 (E3 V4 M5)" GCS format, the leading value otherwise).

const TREND_KEYS = ['hr', 'bp', 'rr', 'spo2', 'gcs', 'pain'] as const

export function parseVital(v?: string): number | null {
  if (!v) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Tiny inline line chart. Renders nothing for fewer than two points.
 *  Stroke uses `currentColor` so it adapts to dark glance vs. the white card. */
function Sparkline({ values, width = 58, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pad = 2
  const stepX = width / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = i * stepX
    const y = height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={lx} cy={ly} r="1.9" fill="currentColor" />
    </svg>
  )
}

/** A wrapping row of metric sparklines; only metrics with ≥2 numeric readings appear. */
export function VitalsTrend({ vitals, className }: { vitals: VitalSign[]; className?: string }) {
  const { t } = useLang()
  const sorted = [...vitals].sort((a, b) => a.takenAt - b.takenAt)
  const cells = TREND_KEYS.map((k) => ({
    k,
    series: sorted.map((v) => parseVital(v[k])).filter((n): n is number => n != null),
  })).filter((c) => c.series.length >= 2)

  if (cells.length === 0) return null

  return (
    <div className={`vtrend${className ? ` ${className}` : ''}`}>
      {cells.map(({ k, series }) => {
        const last = series[series.length - 1]
        const delta = last - series[series.length - 2]
        const dir = delta > 0 ? '▲' : delta < 0 ? '▼' : '▬'
        return (
          <div className="vtrend-cell" key={k} title={`${t(`vit.${k}_name`)} · ${series.length} readings`}>
            <span className="vtrend-k">{t(`vit.${k}`)}</span>
            <Sparkline values={series} />
            <span className="vtrend-d">{dir}{delta !== 0 ? Math.abs(Math.round(delta)) : ''}</span>
          </div>
        )
      })}
    </div>
  )
}
