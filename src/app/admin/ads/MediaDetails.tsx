'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  assignPlacement,
  setAdActive,
  setAdSchedule,
  setMediaActive,
  setMediaClickUrl,
  setMediaSchedule,
  unassignPlacement,
  type AdPlacement,
  type AdStats,
  type Assignment,
  type Media,
} from './actions'
import { isLive, SchedulePanel, StatsLine, StatusBadge, ViewsChart } from './AdInsights'
import { PLACEMENTS } from './placements'

export type DeleteFailure = { stage: 'row' | 'file'; message: string }

// On/off pill shared by the upload's master switch and each ad type.
function Switch({ on, busy, onToggle }: { on: boolean; busy?: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onToggle}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
        on ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground'
      }`}
    >
      {on ? 'Active' : 'Hidden'}
    </button>
  )
}

// Sum each type's per-day views into the upload's chart.
function sumDaily(ads: Assignment[], daily: Record<string, Record<string, number>>) {
  const out: Record<string, number> = {}
  for (const a of ads) for (const [day, n] of Object.entries(daily[a.id] ?? {})) out[day] = (out[day] ?? 0) + n
  return out
}

// Everything about one upload: its master switch/schedule/link, then each
// ad type it can run as (add/remove, own switch, schedule and stats), then
// delete. Shown in the list's dropdown and the grid's detail sheet.
export default function MediaDetails({
  media,
  byAd,
  byMedia,
  daily,
  failure,
  onChange,
  onDelete,
  onRecover,
}: {
  media: Media
  byAd: Record<string, AdStats>
  byMedia: Record<string, AdStats>
  daily: Record<string, Record<string, number>>
  failure: DeleteFailure | undefined
  onChange: (next: Media) => void
  onDelete: (confirmFirst: boolean) => void
  onRecover: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [link, setLink] = useState(media.click_url ?? '')

  const run = async (key: string, action: () => Promise<{ ok: boolean; message?: string }>, apply: () => void) => {
    setBusy(key)
    try {
      const result = await action()
      if (result.ok) apply()
      else toast.error(result.message ?? 'Something went wrong')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const addType = async (placement: AdPlacement) => {
    setBusy(placement)
    try {
      const r = await assignPlacement(media.id, placement)
      if (r.ok) onChange({ ...media, ads: [...media.ads, r.ad] })
      else toast.error(r.message)
    } catch {
      toast.error('Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const updateAd = (id: string, next: Partial<Assignment>) =>
    onChange({ ...media, ads: media.ads.map((a) => (a.id === id ? { ...a, ...next } : a)) })

  if (failure) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-red-700">
          {failure.stage === 'row'
            ? "Couldn't delete this — it's still live."
            : "Removed from the game, but its file couldn't be deleted."}{' '}
          <span className="font-normal opacity-80">({failure.message})</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDelete(false)}
            className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onRecover}
            className="flex-1 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700"
          >
            Recover
          </button>
        </div>
      </div>
    )
  }

  const assigned = media.ads.map((a) => a.placement)

  return (
    <div className="space-y-4">
      {/* The upload itself: master switch for every type it's in. */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Whole upload</p>
            <StatusBadge ad={media} />
          </div>
          <Switch
            on={media.active}
            busy={busy === 'media'}
            onToggle={() => run('media', () => setMediaActive(media.id, !media.active), () => onChange({ ...media, active: !media.active }))}
          />
        </div>
        <SchedulePanel
          ad={media}
          label="Schedule whole upload"
          onSave={(s, e) => setMediaSchedule(media.id, s, e)}
          onChange={(next) => onChange({ ...media, ...next })}
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onBlur={() => {
            if ((media.click_url ?? '') === link.trim()) return
            run('link', () => setMediaClickUrl(media.id, link), () => onChange({ ...media, click_url: link.trim() || null }))
          }}
          placeholder="Click-through link (optional)"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
        />
        <div className="flex items-end justify-between gap-3 rounded-lg bg-black/[0.03] p-2.5">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Total</p>
            <StatsLine placements={assigned} stats={byMedia[media.id]} />
          </div>
          <ViewsChart byDay={sumDaily(media.ads, daily)} />
        </div>
      </section>

      {/* Each ad type: add/remove, its own switch, schedule and stats. */}
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ad types</p>
        {!media.active && <p className="text-xs text-amber-700">The whole upload is hidden, so it isn&apos;t showing as any type.</p>}
        {PLACEMENTS.map((p) => {
          const ad = media.ads.find((a) => a.placement === p.value)
          if (!ad) {
            return (
              <button
                key={p.value}
                type="button"
                disabled={busy === p.value}
                onClick={() => addType(p.value)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground disabled:opacity-50"
              >
                {busy === p.value ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Use as {p.label} <span className="ml-auto opacity-70">{p.size}</span>
              </button>
            )
          }
          const live = isLive(media) && isLive(ad)
          return (
            <div key={p.value} className={`space-y-2 rounded-lg border p-2.5 ${live ? 'border-emerald-200' : 'border-border'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{p.label}</p>
                  <StatusBadge ad={ad} />
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    on={ad.active}
                    busy={busy === ad.id}
                    onToggle={() => run(ad.id, () => setAdActive(ad.id, !ad.active), () => updateAd(ad.id, { active: !ad.active }))}
                  />
                  <button
                    type="button"
                    aria-label={`Stop using as ${p.label}`}
                    disabled={busy === ad.id}
                    onClick={() => {
                      if (!confirm(`Stop using this as ${p.label}? Its ${p.label} stats will be deleted.`)) return
                      run(ad.id, () => unassignPlacement(ad.id), () => onChange({ ...media, ads: media.ads.filter((a) => a.id !== ad.id) }))
                    }}
                    className="p-1.5 text-muted-foreground disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <StatsLine placements={[p.value]} stats={byAd[ad.id]} />
                <ViewsChart byDay={daily[ad.id]} />
              </div>
              <SchedulePanel
                ad={ad}
                label={`Schedule as ${p.label}`}
                onSave={(s, e) => setAdSchedule(ad.id, s, e)}
                onChange={(next) => updateAd(ad.id, next)}
              />
            </div>
          )
        })}
      </section>

      <button
        type="button"
        onClick={() => onDelete(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete upload
      </button>
    </div>
  )
}
