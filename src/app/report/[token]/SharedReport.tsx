'use client'

import { useEffect, useState } from 'react'
import { Breakdown, DailyChart, KpiGrid, MediaThumb, RangePicker } from '@/app/admin/ads/ReportView'
import { PLACEMENTS, rangeBounds, type RangeKey, type Report } from '@/app/admin/ads/shared'
import { getSharedReport, type SharedCampaign } from './actions'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// What the advertiser sees: their campaign's numbers, nothing else.
export default function SharedReport({ token, campaign: c }: { token: string; campaign: SharedCampaign }) {
  const [range, setRange] = useState<RangeKey>('7d')
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    const { from, to } = rangeBounds(range)
    getSharedReport(token, from, to, Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((r) => live && (r ? setReport(r) : setFailed(true)))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [range, token])

  return (
    <div className="w-full max-w-4xl space-y-4">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Campaign report</p>
          <h1 className="truncate text-2xl font-semibold">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[c.advertiser, c.starts_at || c.ends_at ? `${c.starts_at ? day(c.starts_at) : 'Ongoing'} – ${c.ends_at ? day(c.ends_at) : 'ongoing'}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static icon */}
        <img src="/rubble-icon-512.png" alt="Rubble" className="h-10 w-10 shrink-0 rounded-xl" />
      </header>

      <RangePicker value={range} onChange={setRange} />

      {failed ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          This report link no longer works. Ask for a new one.
        </p>
      ) : report ? (
        <>
          <KpiGrid t={report.totals} showBricks={false} />
          <DailyChart days={report.days} />
          <Breakdown
            title="By placement"
            rows={PLACEMENTS.filter((p) => report.byPlacement[p.value]).map((p) => ({ key: p.value, label: p.label, t: report.byPlacement[p.value] }))}
          />
          <Breakdown
            title="By ad"
            rows={c.creatives
              .filter((cr) => report.byCreative[cr.id])
              .map((cr) => ({
                key: cr.id,
                label: (
                  <span className="flex items-center gap-2">
                    <MediaThumb kind={cr.kind} url={cr.media_url} className="h-7 w-12" />
                    <span className="truncate">{cr.name || 'Ad'}</span>
                  </span>
                ),
                t: report.byCreative[cr.id],
              }))}
          />
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-xl bg-foreground/[0.06]" />
      )}

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Views: times an ad was shown · Reach: different players · CTR: clicks per view · Watched: video plays finished
      </p>
    </div>
  )
}
