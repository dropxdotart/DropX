'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronDown, Eye, LayoutGrid, List, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteMedia,
  getAdSettings,
  getDailyViews,
  getStats,
  removeAdFile,
  restoreMedia,
  setUnlockSeconds,
  type AdPlacement,
  type AdStats,
  type Media,
} from './actions'
import { isLive } from './AdInsights'
import MediaDetails, { type DeleteFailure } from './MediaDetails'
import UploadCard from './UploadCard'
import { PLACEMENTS, placementInfo, type Preview } from './placements'

type Range = 'today' | 'week' | 'all'
const RANGES: { value: Range; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'all', label: 'All time' },
]

// Start of the range in the admin's own time zone.
function rangeStart(range: Range): string {
  if (range === 'all') return new Date(0).toISOString()
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - 6)
  return d.toISOString()
}

type Filter = 'all' | AdPlacement | 'none'
type View = 'list' | 'grid'
const VIEW_KEY = 'rubble-admin-ads-view'
const VIEW_EVENT = 'rubble-admin-ads-view'

// The list/grid choice is remembered per browser. Read through a store so
// the server render (always list) and the browser agree on first paint.
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function subscribeView(onChange: () => void) {
  window.addEventListener(VIEW_EVENT, onChange)
  return () => window.removeEventListener(VIEW_EVENT, onChange)
}

// Live as a type = the upload AND that type are both on and in schedule.
function liveTypes(m: Media): AdPlacement[] {
  if (!isLive(m)) return []
  return m.ads.filter(isLive).map((a) => a.placement)
}

// Full-screen look at an ad's image or video (plays with sound controls).
function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {preview.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Storage / local blob URL
          <img src={preview.url} alt="Ad preview" className="max-h-[80dvh] w-full rounded-xl object-contain" />
        ) : (
          <video src={preview.url} className="max-h-[80dvh] w-full rounded-xl bg-black" controls autoPlay playsInline />
        )}
      </div>
    </div>
  )
}

// How long each ad type must play before it can be closed.
function TimingSettings() {
  const [values, setValues] = useState<Record<string, number> | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    getAdSettings()
      .then(setValues)
      .catch(() => setValues({}))
  }, [])

  const rows: { placement: 'interstitial' | 'rewarded'; label: string; hint: string; fallback: number }[] = [
    { placement: 'interstitial', label: 'Interstitial skippable after', hint: 'or when a shorter video ends', fallback: 10 },
    { placement: 'rewarded', label: 'Rewarded unlocks reward after', hint: "can't be closed before; or when a shorter video ends", fallback: 15 },
  ]

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">Ad timing</p>
      {rows.map((r) => (
        <div key={r.placement} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm">{r.label}</p>
            <p className="text-xs text-muted-foreground">{r.hint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={120}
              disabled={!values || saving === r.placement}
              value={values?.[r.placement] ?? r.fallback}
              onChange={(e) => setValues((v) => ({ ...(v ?? {}), [r.placement]: Number(e.target.value) }))}
              onBlur={async (e) => {
                setSaving(r.placement)
                const result = await setUnlockSeconds(r.placement, Number(e.target.value)).catch(() => ({
                  ok: false as const,
                  message: "Couldn't save",
                }))
                setSaving(null)
                if (result.ok) toast.success('Saved')
                else toast.error(result.message)
              }}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">sec</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Thumb({ media, className, onPreview }: { media: Media; className: string; onPreview: (p: Preview) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPreview({ kind: media.kind, url: media.media_url })}
      className={`relative overflow-hidden bg-secondary ${className}`}
      aria-label="Preview"
    >
      {media.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
        <img src={media.media_url} alt="" className="h-full w-full object-cover" />
      ) : (
        // `#t=0.1` + preload makes iOS Safari draw the first frame.
        <video src={`${media.media_url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/55 py-0.5 text-[9px] font-medium text-white">
        <Eye className="h-2.5 w-2.5" /> Preview
      </span>
    </button>
  )
}

// One chip per ad type the upload is assigned to; green when it's live.
function TypeChips({ media, short = false }: { media: Media; short?: boolean }) {
  const live = liveTypes(media)
  if (!media.ads.length) return <span className="text-[11px] text-muted-foreground">Not used yet</span>
  return (
    <div className="flex flex-wrap gap-1">
      {media.ads.map((a) => {
        const on = live.includes(a.placement)
        const info = placementInfo(a.placement)
        return (
          <span
            key={a.id}
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary text-muted-foreground'}`}
          >
            {short ? info.short : info.label}
          </span>
        )
      })}
    </div>
  )
}

export default function AdManager({ initialMedia }: { initialMedia: Media[] }) {
  const [media, setMedia] = useState(initialMedia)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [range, setRange] = useState<Range>('week')
  const [stats, setStats] = useState<{ byAd: Record<string, AdStats>; byMedia: Record<string, AdStats> }>({ byAd: {}, byMedia: {} })
  const [daily, setDaily] = useState<Record<string, Record<string, number>>>({})
  const view = useSyncExternalStore(subscribeView, readView, () => 'list' as View)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)
  // Uploads whose delete failed part-way: shown red with Delete / Recover.
  // stage 'row' = nothing was deleted; 'file' = the row is gone but the
  // file is still in Storage (so Recover can put it back).
  const [failed, setFailed] = useState<Record<string, DeleteFailure>>({})

  const chooseView = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage unavailable — the choice just won't be remembered
    }
    window.dispatchEvent(new Event(VIEW_EVENT))
  }

  useEffect(() => {
    getStats(rangeStart(range))
      .then(setStats)
      .catch(() => toast.error("Couldn't load stats"))
  }, [range])

  useEffect(() => {
    getDailyViews(Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then(setDaily)
      .catch(() => {})
  }, [])

  const update = (next: Media) => setMedia((prev) => prev.map((m) => (m.id === next.id ? next : m)))

  const clearFailed = (id: string) =>
    setFailed((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const handleDelete = async (m: Media, confirmFirst: boolean) => {
    if (confirmFirst && !confirm('Delete this upload? It stops showing everywhere and its stats are removed.')) return
    const prior = failed[m.id]
    try {
      const result = prior?.stage === 'file' ? await removeAdFile(m.media_url) : await deleteMedia(m.id, m.media_url)
      if (result.ok) {
        setMedia((prev) => prev.filter((x) => x.id !== m.id))
        clearFailed(m.id)
        setSheet(null)
        toast.success('Deleted')
      } else {
        setFailed((prev) => ({ ...prev, [m.id]: { stage: result.stage, message: result.message } }))
      }
    } catch {
      setFailed((prev) => ({ ...prev, [m.id]: { stage: prior?.stage ?? 'row', message: 'Network error' } }))
    }
  }

  const handleRecover = async (m: Media) => {
    if (failed[m.id]?.stage !== 'file') {
      clearFailed(m.id)
      return
    }
    const result = await restoreMedia(m).catch(() => ({ ok: false as const, message: "Couldn't recover it" }))
    if (result.ok) clearFailed(m.id)
    else toast.error(result.message)
  }

  const shown = media.filter((m) =>
    filter === 'all' ? true : filter === 'none' ? m.ads.length === 0 : m.ads.some((a) => a.placement === filter)
  )
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: `All (${media.length})` },
    ...PLACEMENTS.map((p) => ({ value: p.value as Filter, label: p.label })),
    { value: 'none', label: 'Not used' },
  ]
  const sheetMedia = media.find((m) => m.id === sheet)

  const details = (m: Media) => (
    <MediaDetails
      key={m.id}
      media={m}
      byAd={stats.byAd}
      byMedia={stats.byMedia}
      daily={daily}
      failure={failed[m.id]}
      onChange={update}
      onDelete={(confirmFirst) => handleDelete(m, confirmFirst)}
      onRecover={() => handleRecover(m)}
    />
  )

  return (
    <div className="w-full max-w-lg space-y-6">
      {preview && (
        <PreviewModal
          preview={preview}
          onClose={() => {
            if (preview.url.startsWith('blob:')) URL.revokeObjectURL(preview.url)
            setPreview(null)
          }}
        />
      )}

      <h1 className="text-lg font-semibold">Ads admin</h1>

      <UploadCard onPreview={setPreview} />
      <TimingSettings />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Library</p>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-secondary p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${range === r.value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-full bg-secondary p-0.5">
              {(['list', 'grid'] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => chooseView(v)}
                  aria-label={v === 'list' ? 'List view' : 'Grid view'}
                  aria-pressed={view === v}
                  className={`rounded-full p-1.5 ${view === v ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  {v === 'list' ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.value ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}

        {view === 'list' ? (
          <div className="space-y-2">
            {shown.map((m) => {
              const open = expanded === m.id
              const live = liveTypes(m)
              return (
                <div key={m.id} className={`rounded-xl border ${failed[m.id] ? 'border-red-400 bg-red-50' : 'border-border bg-card'}`}>
                  <div className="flex items-center gap-3 p-3">
                    <Thumb media={m} className="h-16 w-16 shrink-0 rounded-lg" onPreview={setPreview} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-mono text-xs uppercase text-muted-foreground">
                        {m.kind} · {live.length ? <span className="text-emerald-700">live</span> : 'not live'}
                      </p>
                      <TypeChips media={m} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : m.id)}
                      aria-expanded={open}
                      aria-label="Stats and settings"
                      className="rounded-full bg-secondary p-2"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {(open || failed[m.id]) && <div className="border-t border-border p-3">{details(m)}</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {shown.map((m) => {
              const live = liveTypes(m).length > 0
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSheet(m.id)}
                  className={`relative aspect-square overflow-hidden rounded-xl bg-secondary ${failed[m.id] ? 'ring-2 ring-red-500' : ''}`}
                >
                  {m.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                    <img src={m.media_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={`${m.media_url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  )}
                  <span
                    className={`absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full border border-white ${live ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                    title={live ? 'Live' : 'Not live'}
                  />
                  {m.kind === 'video' && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1 text-[9px] font-medium text-white">VIDEO</span>
                  )}
                  <div className="absolute inset-x-1 bottom-1">
                    <TypeChips media={m} short />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {sheetMedia && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSheet(null)}>
          <div
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <Thumb media={sheetMedia} className="h-24 w-40 shrink-0 rounded-xl" onPreview={setPreview} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-mono text-xs uppercase text-muted-foreground">{sheetMedia.kind}</p>
                <TypeChips media={sheetMedia} />
              </div>
              <button type="button" onClick={() => setSheet(null)} className="rounded-full bg-secondary p-2" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {details(sheetMedia)}
          </div>
        </div>
      )}
    </div>
  )
}
