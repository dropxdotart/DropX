'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Archive, ArchiveRestore, Copy, Link2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ISLANDS } from '@/lib/game/islands'
import { deleteCampaign, duplicateCampaign, resetReportLink, setCampaignStatus } from './actions'
import { ServingPill, toastResult, useReport } from './AdsOverview'
import CampaignEditor from './CampaignEditor'
import Creatives from './Creatives'
import { Breakdown, DailyChart, KpiGrid, MediaThumb, RangePicker } from './ReportView'
import { DAYS, PLACEMENTS, servingState, type Campaign, type CampaignInput, type Creative, type RangeKey } from './shared'

type Tab = 'report' | 'ads' | 'settings'
const TABS: { value: Tab; label: string }[] = [
  { value: 'report', label: 'Report' },
  { value: 'ads', label: 'Ads' },
  { value: 'settings', label: 'Settings' },
]

function hour(h: number) {
  return h === 0 || h === 24 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`
}
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// The campaign's setup in one line each, so it can be checked at a glance.
export function describe(c: Campaign): { label: string; value: string }[] {
  const runs =
    c.starts_at || c.ends_at ? `${c.starts_at ? day(c.starts_at) : 'Now'} → ${c.ends_at ? day(c.ends_at) : 'no end date'}` : 'Starts now, no end date'
  const days = c.days?.length ? c.days.map((d) => DAYS[d]).join(', ') : 'Every day'
  const hours = c.hour_from === null && c.hour_to === null ? 'all day' : `${hour(c.hour_from ?? 0)}–${hour(c.hour_to ?? 24)}`
  const limits = [
    c.freq_cap && `${c.freq_cap} per player a day`,
    c.daily_cap && `${c.daily_cap.toLocaleString()} a day`,
    c.total_cap && `${c.total_cap.toLocaleString()} total`,
  ].filter(Boolean)
  const who = [
    c.audience === 'new' ? 'New players' : c.audience === 'returning' ? 'Returning players' : 'Everyone',
    c.min_level || c.max_level ? `levels ${c.min_level ?? 1}–${c.max_level ?? '∞'}` : null,
    c.islands?.length ? `reached ${c.islands.map((i) => ISLANDS.find((s) => s.id === i)?.name ?? i).join(' or ')}` : null,
  ].filter(Boolean)
  return [
    { label: 'Placements', value: PLACEMENTS.filter((p) => c.placements.includes(p.value)).map((p) => p.label).join(', ') || 'None' },
    { label: 'Runs', value: runs },
    { label: 'When', value: `${days}, ${hours} (${c.tz.replace('_', ' ')})` },
    { label: 'Limits', value: limits.length ? limits.join(' · ') : 'No limits' },
    { label: 'Audience', value: who.join(', ') },
    { label: 'Priority', value: `${c.weight}×` },
  ]
}

export default function CampaignView({ campaign: c, creatives }: { campaign: Campaign; creatives: Creative[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'report')
  const [range, setRange] = useState<RangeKey>('7d')
  const [token, setToken] = useState(c.report_token)
  const report = useReport(range, c.id)
  const live = creatives.filter((cr) => cr.status === 'active').length
  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/report/${token}`

  const go = (t: Tab) => {
    setTab(t)
    window.history.replaceState(null, '', `?tab=${t}`)
  }

  const setStatus = async (status: Campaign['status'], msg: string) => {
    if (toastResult(await setCampaignStatus(c.id, status), msg)) router.refresh()
  }
  const duplicate = async () => {
    const r = await duplicateCampaign(c.id)
    if (toastResult(r, 'Copied — it starts paused') && r.ok) router.push(`/admin/ads/${r.id}?tab=settings`)
  }
  const remove = async () => {
    if (!confirm(`Delete "${c.name}" and all of its stats? Archive it instead to keep the stats.`)) return
    if (toastResult(await deleteCampaign(c.id), 'Deleted')) router.push('/admin/ads')
  }
  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Report link copied')
  }
  const newLink = async () => {
    if (!confirm('Make a new link? Anyone with the old one loses access.')) return
    const r = await resetReportLink(c.id)
    if (toastResult(r, 'New link made') && r.ok) setToken(r.token)
  }

  const input: CampaignInput = {
    ...c,
    status: c.status === 'archived' ? 'paused' : c.status,
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {creatives[0] && <MediaThumb kind={creatives[0].kind} url={creatives[0].media_url} className="h-12 w-20" />}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{c.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ServingPill s={servingState(c, live)} />
              {c.advertiser && <span>{c.advertiser}</span>}
              <span>
                {live} of {creatives.length} ads on
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {c.status !== 'archived' ? (
            <label className="mr-2 flex items-center gap-2 text-sm">
              <Switch checked={c.status === 'active'} onCheckedChange={(on) => setStatus(on ? 'active' : 'paused', on ? 'Campaign on' : 'Campaign paused')} />
              {c.status === 'active' ? 'On' : 'Paused'}
            </label>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setStatus('paused', 'Restored, paused')}>
              <ArchiveRestore /> Restore
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={duplicate} title="Duplicate" aria-label="Duplicate">
            <Copy />
          </Button>
          {c.status !== 'archived' && (
            <Button variant="ghost" size="icon" onClick={() => setStatus('archived', 'Archived')} title="Archive" aria-label="Archive">
              <Archive />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={remove} title="Delete" aria-label="Delete">
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => go(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? 'border-[#2d7ff9] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.value === 'ads' && <span className="ml-1.5 rounded-full bg-foreground/[0.06] px-1.5 text-[11px]">{creatives.length}</span>}
          </button>
        ))}
      </div>

      {tab !== 'settings' && <RangePicker value={range} onChange={setRange} />}

      {tab === 'report' && (
        <div className="space-y-3">
          {report ? (
            <>
              <KpiGrid t={report.totals} />
              <DailyChart days={report.days} />
              <Breakdown
                title="By placement"
                rows={PLACEMENTS.filter((p) => report.byPlacement[p.value]).map((p) => ({ key: p.value, label: p.label, t: report.byPlacement[p.value] }))}
              />
              <Breakdown
                title="By ad"
                rows={creatives
                  .filter((cr) => report.byCreative[cr.id])
                  .map((cr) => ({
                    key: cr.id,
                    label: (
                      <span className="flex items-center gap-2">
                        <MediaThumb kind={cr.kind} url={cr.media_url} className="h-7 w-12" />
                        <span className="truncate">{cr.name || 'Untitled ad'}</span>
                      </span>
                    ),
                    t: report.byCreative[cr.id],
                  }))}
              />
            </>
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-foreground/[0.06]" />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-medium">Setup</p>
              <dl className="space-y-1.5 text-sm">
                {describe(c).map((r) => (
                  <div key={r.label} className="flex gap-3">
                    <dt className="w-20 shrink-0 text-muted-foreground">{r.label}</dt>
                    <dd className="min-w-0">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <button type="button" onClick={() => go('settings')} className="mt-2 text-xs font-medium text-[#2d7ff9]">
                Edit settings
              </button>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-medium">Share this report</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Anyone with the link sees this campaign&apos;s numbers (read-only) — nothing else. Good for sending to the advertiser.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={shareUrl} className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-foreground/[0.06] px-2 text-xs" onFocus={(e) => e.target.select()} />
                <Button size="sm" onClick={copyLink}>
                  <Link2 /> Copy
                </Button>
              </div>
              <button type="button" onClick={newLink} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3 w-3" /> Make a new link (turns the old one off)
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'ads' && <Creatives campaign={c} creatives={creatives} report={report} />}

      {tab === 'settings' && <CampaignEditor key={c.updated_at} id={c.id} initial={input} />}
    </div>
  )
}
