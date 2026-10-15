'use client'

import { useState, type ReactNode } from 'react'
import { avgWatch, completion, ctr, num, pct, RANGES, secs, type RangeKey, type Report, type Totals } from './shared'

// Report building blocks shared by the ads admin and the public share page.

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-foreground/[0.06] p-1" role="tablist" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          role="tab"
          aria-selected={value === r.value}
          onClick={() => onChange(r.value)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            value === r.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function KpiGrid({ t, showBricks = true }: { t: Totals; showBricks?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Kpi label="Views" value={num(t.views)} sub={t.reach ? `${(t.views / t.reach).toFixed(1)} per player` : undefined} hint="Times an ad was shown" />
      <Kpi label="Reach" value={num(t.reach)} sub="unique players" hint="Different players who saw an ad" />
      <Kpi label="Clicks" value={num(t.clicks)} sub={`${pct(ctr(t))} CTR`} hint="Taps on the ad or its button" />
      <Kpi
        label="Watched through"
        value={t.completes + t.skips ? pct(completion(t)) : '—'}
        sub={!(t.completes + t.skips) ? 'no video plays yet' : t.watchSeconds ? `avg ${secs(avgWatch(t))} watched` : `${num(t.completes)} of ${num(t.completes + t.skips)} plays`}
        hint="Full-screen and rewarded plays watched to the end (or the required time)"
      />
      {showBricks && t.bricks > 0 && (
        <div className="col-span-2 sm:col-span-4">
          <Kpi label="Rewards given" value={`🧱 ${num(t.bricks)}`} sub={`${num(t.completes)} rewarded plays`} />
        </div>
      )}
    </div>
  )
}

type Metric = 'views' | 'clicks' | 'completes'
const METRICS: { value: Metric; label: string }[] = [
  { value: 'views', label: 'Views' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'completes', label: 'Watched' },
]

function shortDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Daily bars for one metric; hover (or tap) a bar for its numbers.
export function DailyChart({ days }: { days: Report['days'] }) {
  const [metric, setMetric] = useState<Metric>('views')
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d[metric]))
  const shown = hover !== null ? days[hover] : null
  const total = days.reduce((n, d) => n + d[metric], 0)
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMetric(m.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${metric === m.value ? 'bg-[#2d7ff9] text-white' : 'bg-foreground/[0.06] text-muted-foreground'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {shown ? (
            <>
              <span className="font-medium text-foreground">{shortDay(shown.day)}</span> · {num(shown.views)} views · {num(shown.clicks)} clicks ·{' '}
              {num(shown.completes)} watched
            </>
          ) : (
            <>
              {num(total)} {METRICS.find((m) => m.value === metric)!.label.toLowerCase()} · peak {num(max === 1 && !total ? 0 : max)}/day
            </>
          )}
        </p>
      </div>
      <div className="relative h-36">
        {/* Grid lines at the top, middle and base */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${f * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-label={`${shortDay(d.day)}: ${d[metric]}`}
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(hover === i ? null : i)}
              className="group flex h-full min-w-0 flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-[3px] transition-colors ${hover === i ? 'bg-[#1a5fd0]' : 'bg-[#2d7ff9]'} ${d[metric] ? '' : 'opacity-25'}`}
                style={{ height: `${Math.max(d[metric] ? 3 : 1.5, (d[metric] / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      {days.length > 0 && (
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{shortDay(days[0].day)}</span>
          {days.length > 2 && <span>{shortDay(days[Math.floor(days.length / 2)].day)}</span>}
          <span>{shortDay(days[days.length - 1].day)}</span>
        </div>
      )}
    </div>
  )
}

// A breakdown table: one row per placement / ad / campaign.
export function Breakdown({
  title,
  rows,
  showReach,
  empty = 'Nothing yet in this range.',
}: {
  title: string
  rows: { key: string; label: ReactNode; t: Totals }[]
  showReach?: boolean
  empty?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <p className="border-b border-border px-3 py-2 text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium" />
                <th className="px-3 py-2 text-right font-medium">Views</th>
                {showReach && <th className="px-3 py-2 text-right font-medium">Reach</th>}
                <th className="px-3 py-2 text-right font-medium">Clicks</th>
                <th className="px-3 py-2 text-right font-medium">CTR</th>
                <th className="px-3 py-2 text-right font-medium">Watched</th>
                <th className="px-3 py-2 text-right font-medium">Avg watch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, label, t }) => (
                <tr key={key} className="border-t border-border">
                  <td className="max-w-[14rem] px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right">{num(t.views)}</td>
                  {showReach && <td className="px-3 py-2 text-right">{num(t.reach)}</td>}
                  <td className="px-3 py-2 text-right">{num(t.clicks)}</td>
                  <td className="px-3 py-2 text-right">{t.views ? pct(ctr(t)) : '—'}</td>
                  <td className="px-3 py-2 text-right">{t.completes + t.skips ? pct(completion(t)) : '—'}</td>
                  <td className="px-3 py-2 text-right">{t.watchSeconds ? secs(avgWatch(t)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function MediaThumb({ kind, url, className = 'h-10 w-16' }: { kind: 'image' | 'video'; url: string; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-md bg-black ${className}`}>
      {kind === 'video' ? (
        <video src={`${url}#t=0.5`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
      {kind === 'video' && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-medium text-white">VIDEO</span>}
    </span>
  )
}
