'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getReport, setCampaignStatus, setUnlockSeconds, type Result } from './actions'
import { Breakdown, DailyChart, KpiGrid, MediaThumb, RangePicker } from './ReportView'
import {
  ctr,
  num,
  pct,
  placementLabel,
  PLACEMENTS,
  rangeBounds,
  servingState,
  ZERO,
  type AdPlacement,
  type Campaign,
  type Creative,
  type RangeKey,
  type Report,
  type Serving,
} from './shared'

const TONES: Record<Serving['tone'], string> = {
  good: 'bg-[#e3f6e6] text-[#1f7a2a] dark:bg-[#1f7a2a]/25 dark:text-[#7fe08a]',
  wait: 'bg-[#fff1cc] text-[#8a5a00] dark:bg-[#8a5a00]/25 dark:text-[#ffd36b]',
  off: 'bg-foreground/[0.06] text-muted-foreground',
  warn: 'bg-[#ffe4dc] text-[#b3361a] dark:bg-[#b3361a]/25 dark:text-[#ff9c80]',
}

export function ServingPill({ s }: { s: Serving }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[s.tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  )
}

export function toastResult(r: Result, ok?: string) {
  if (!r.ok) toast.error(r.message)
  else if (ok) toast.success(ok)
  return r.ok
}

// Hook: a report for the picked range, refetched when it changes.
export function useReport(range: RangeKey, campaignId: string | null) {
  const [report, setReport] = useState<Report | null>(null)
  useEffect(() => {
    let live = true
    const { from, to } = rangeBounds(range)
    getReport(from, to, Intl.DateTimeFormat().resolvedOptions().timeZone, campaignId)
      .then((r) => live && setReport(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not load the report'))
    return () => {
      live = false
    }
  }, [range, campaignId])
  return report
}

// The ads home: totals for the range, the daily chart, every campaign with
// its numbers and an on/off switch, and how long full-screen ads run.
export default function AdsOverview({
  campaigns,
  creatives,
  settings,
}: {
  campaigns: Campaign[]
  creatives: Creative[]
  settings: Record<string, number>
}) {
  const router = useRouter()
  const [range, setRange] = useState<RangeKey>('7d')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const report = useReport(range, null)

  const live = (id: string) => creatives.filter((c) => c.campaign_id === id && c.status === 'active')
  const list = campaigns.filter((c) => (c.status === 'archived') === showArchived)
  const archivedCount = campaigns.filter((c) => c.status === 'archived').length

  const toggle = async (c: Campaign, on: boolean) => {
    setBusy(c.id)
    if (toastResult(await setCampaignStatus(c.id, on ? 'active' : 'paused'), on ? `${c.name} is on` : `${c.name} is paused`)) router.refresh()
    setBusy(null)
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ads</h1>
          <p className="text-sm text-muted-foreground">Campaigns, where and when they run, and how they&apos;re doing.</p>
        </div>
        <Link href="/admin/ads/new" className={buttonVariants()}>
          <Plus /> New campaign
        </Link>
      </div>

      <RangePicker value={range} onChange={setRange} />

      {report ? (
        <>
          <KpiGrid t={report.totals} />
          <DailyChart days={report.days} />
        </>
      ) : (
        <div className="h-64 animate-pulse rounded-xl bg-foreground/[0.06]" />
      )}

      {/* Campaigns */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-medium">{showArchived ? 'Archived campaigns' : 'Campaigns'}</p>
          {(archivedCount > 0 || showArchived) && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-medium text-[#2d7ff9]">
              {showArchived ? 'Back to campaigns' : `Archived (${archivedCount})`}
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">{showArchived ? 'Nothing archived.' : 'No campaigns yet.'}</p>
            {!showArchived && (
              <Link href="/admin/ads/new" className="mt-1 inline-block text-sm font-medium text-[#2d7ff9]">
                Create your first campaign
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-12 px-3 py-2 font-medium">On</th>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 text-right font-medium">Views</th>
                  <th className="px-3 py-2 text-right font-medium">Reach</th>
                  <th className="px-3 py-2 text-right font-medium">Clicks</th>
                  <th className="px-3 py-2 text-right font-medium">CTR</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const ads = live(c.id)
                  const t = report?.byCampaign[c.id] ?? ZERO
                  const thumbs = creatives.filter((cr) => cr.campaign_id === c.id).slice(0, 3)
                  return (
                    <tr key={c.id} className="border-t border-border align-middle hover:bg-accent/50">
                      <td className="px-3 py-2.5">
                        {c.status !== 'archived' && (
                          <Switch
                            checked={c.status === 'active'}
                            disabled={busy === c.id}
                            onCheckedChange={(on) => toggle(c, on)}
                            aria-label={c.status === 'active' ? 'Pause campaign' : 'Start campaign'}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/ads/${c.id}`} className="flex min-w-[15rem] items-center gap-3">
                          <span className="flex -space-x-6">
                            {thumbs.length ? (
                              thumbs.map((cr) => <MediaThumb key={cr.id} kind={cr.kind} url={cr.media_url} className="h-9 w-14 ring-2 ring-card" />)
                            ) : (
                              <span className="flex h-9 w-14 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground">
                                No ads
                              </span>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:underline">{c.name}</span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <ServingPill s={servingState(c, ads.length)} />
                              {c.advertiser && <span>{c.advertiser}</span>}
                              <span>{c.placements.map(placementLabel).join(' · ') || 'No placements'}</span>
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right">{num(t.views)}</td>
                      <td className="px-3 py-2.5 text-right">{num(t.reach)}</td>
                      <td className="px-3 py-2.5 text-right">{num(t.clicks)}</td>
                      <td className="px-3 py-2.5 text-right">{t.views ? pct(ctr(t)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {report && (
        <Breakdown
          title="By placement"
          rows={PLACEMENTS.filter((p) => report.byPlacement[p.value]).map((p) => ({ key: p.value, label: p.label, t: report.byPlacement[p.value] }))}
        />
      )}

      <PlacementSettings settings={settings} />
    </div>
  )
}

// How long full-screen ads must play before they can be closed.
function PlacementSettings({ settings }: { settings: Record<string, number> }) {
  const rows: { p: AdPlacement; label: string; help: string; fallback: number }[] = [
    { p: 'rewarded', label: 'Rewarded', help: 'Seconds before the reward is earned', fallback: 15 },
    { p: 'interstitial', label: 'Full-screen', help: 'Seconds before it can be skipped', fallback: 10 },
  ]
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.p, String(settings[r.p] ?? r.fallback)])))
  const save = async (p: AdPlacement) => {
    const n = Number(values[p])
    toastResult(await setUnlockSeconds(p, n), `${placementLabel(p)}: ${n}s`)
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <p className="border-b border-border px-3 py-2 text-sm font-medium">Placement settings</p>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.p} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.help}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={120}
                value={values[r.p]}
                onChange={(e) => setValues((v) => ({ ...v, [r.p]: e.target.value }))}
                onBlur={() => Number(values[r.p]) !== (settings[r.p] ?? r.fallback) && save(r.p)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-right text-sm tabular-nums"
                aria-label={`${r.label} seconds`}
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
