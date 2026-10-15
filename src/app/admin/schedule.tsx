'use client'

import { useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Result shape the admin's server actions return.
type Result = { ok: true } | { ok: false; message: string }

// Anything with an on/off switch and an optional time window: a live
// event, a building, …
export type LiveWindow = {
  active: boolean
  starts_at: string | null
  ends_at: string | null
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Live state from the on/off switch and optional time window.
export function scheduleStatus(ad: LiveWindow, now = Date.now()): { label: string; tone: 'live' | 'waiting' | 'off' } {
  if (!ad.active) return { label: 'Hidden', tone: 'off' }
  if (ad.starts_at && new Date(ad.starts_at).getTime() > now) return { label: `Scheduled · starts ${when(ad.starts_at)}`, tone: 'waiting' }
  if (ad.ends_at && new Date(ad.ends_at).getTime() <= now) return { label: `Ended ${when(ad.ends_at)}`, tone: 'off' }
  if (ad.ends_at) return { label: `Live until ${when(ad.ends_at)}`, tone: 'live' }
  return { label: 'Live', tone: 'live' }
}

export function isLive(w: LiveWindow) {
  return scheduleStatus(w).tone === 'live'
}

export function StatusBadge({ ad }: { ad: LiveWindow }) {
  const s = scheduleStatus(ad)
  const tone =
    s.tone === 'live' ? 'bg-emerald-100 text-emerald-800' : s.tone === 'waiting' ? 'bg-amber-100 text-amber-800' : 'bg-secondary text-muted-foreground'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{s.label}</span>
}

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

const QUICK_DAYS = [1, 3, 7, 30]

// Run for a set time: quick "from now" durations, or an exact window.
// `onSave` writes it; `onChange` updates the page (scheduling turns it on).
export function SchedulePanel({
  ad,
  label = 'Schedule',
  onSave,
  onChange,
}: {
  ad: LiveWindow
  label?: string
  onSave: (startsAt: string | null, endsAt: string | null) => Promise<Result>
  onChange: (next: Partial<LiveWindow>) => void
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(toLocalInput(ad.starts_at))
  const [end, setEnd] = useState(toLocalInput(ad.ends_at))
  const [busy, setBusy] = useState(false)

  const save = async (startsAt: string | null, endsAt: string | null) => {
    setBusy(true)
    try {
      const result = await onSave(startsAt, endsAt)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      onChange({ starts_at: startsAt, ends_at: endsAt, ...(startsAt || endsAt ? { active: true } : {}) })
      setStart(toLocalInput(startsAt))
      setEnd(toLocalInput(endsAt))
      toast.success(startsAt || endsAt ? 'Schedule saved' : 'Schedule cleared')
    } catch {
      toast.error("Couldn't save the schedule")
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-[#2d7ff9]">
        <CalendarClock className="h-3.5 w-3.5" /> {label}
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg bg-black/[0.03] p-2.5">
      <p className="text-xs font-medium">Run from now for</p>
      <div className="flex gap-1.5">
        {QUICK_DAYS.map((days) => (
          <button
            key={days}
            type="button"
            disabled={busy}
            onClick={() => {
              const now = new Date()
              save(now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString())
            }}
            className="flex-1 rounded-full border border-border bg-card px-2 py-1 text-xs font-medium disabled:opacity-50"
          >
            {days === 1 ? '1 day' : `${days} days`}
          </button>
        ))}
      </div>
      <p className="pt-1 text-xs font-medium">Or pick exact times</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5 text-[11px] text-muted-foreground">
          Starts (optional)
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
        </label>
        <label className="space-y-0.5 text-[11px] text-muted-foreground">
          Ends (optional)
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || (!start && !end)}
          onClick={() => save(fromLocalInput(start), fromLocalInput(end))}
          className="flex-1 rounded-full bg-[#2d7ff9] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : 'Save times'}
        </button>
        {(ad.starts_at || ad.ends_at) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(null, null)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Clear schedule
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-xs text-muted-foreground">
          Done
        </button>
      </div>
    </div>
  )
}
