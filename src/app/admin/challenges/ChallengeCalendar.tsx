'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { setScheduledDate, pushChallengeNow } from './actions'
import type { ChallengeAdmin } from '@/lib/types'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildMonthCells(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: (string | null)[] = Array(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`)
  }
  return cells
}

export default function ChallengeCalendar({ items, todayDate }: { items: ChallengeAdmin[]; todayDate: string }) {
  const byDate = useMemo(() => {
    const map = new Map<string, ChallengeAdmin>()
    for (const c of items) {
      if (c.scheduled_date) map.set(c.scheduled_date, c)
      else if (c.drop_at) map.set(c.drop_at.slice(0, 10), c)
    }
    return map
  }, [items])

  const availableChallenges = useMemo(() => items.filter((c) => !c.drop_at && !c.scheduled_date), [items])

  const [monthKey, setMonthKey] = useState(todayDate.slice(0, 7))
  const cells = buildMonthCells(monthKey)

  const [dialogDate, setDialogDate] = useState<string | null>(null)
  const [selectedChallengeId, setSelectedChallengeId] = useState('')
  const [busy, setBusy] = useState(false)

  const [pushDialogOpen, setPushDialogOpen] = useState(false)
  const [pushConfirmText, setPushConfirmText] = useState('')
  const [pushBusy, setPushBusy] = useState(false)

  const dialogChallenge = dialogDate ? byDate.get(dialogDate) : null

  const openDay = (date: string) => {
    setDialogDate(date)
    setSelectedChallengeId('')
  }

  const handleAssign = async () => {
    if (!dialogDate || !selectedChallengeId) return
    setBusy(true)
    try {
      await setScheduledDate(selectedChallengeId, dialogDate)
      toast.success('Scheduled')
      setDialogDate(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const handleUnschedule = async () => {
    if (!dialogChallenge) return
    setBusy(true)
    try {
      await setScheduledDate(dialogChallenge.id, null)
      toast.success('Removed from that date')
      setDialogDate(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const handlePush = async () => {
    setPushBusy(true)
    try {
      await pushChallengeNow()
      toast.success("Today's challenge is live")
      setPushDialogOpen(false)
      setPushConfirmText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonthKey((k) => shiftMonth(k, -1))} className="p-1 rounded hover:bg-white/10">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-medium">{monthLabel(monthKey)}</p>
        <button type="button" onClick={() => setMonthKey((k) => shiftMonth(k, 1))} className="p-1 rounded hover:bg-white/10">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAY_LABELS.map((w, i) => <div key={i}>{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const challenge = byDate.get(date)
          const isToday = date === todayDate
          const isUsed = Boolean(challenge?.drop_at)
          return (
            <button
              key={date}
              type="button"
              onClick={() => openDay(date)}
              className={cn(
                'aspect-square rounded-md p-1 flex flex-col items-start justify-start overflow-hidden text-left transition-colors',
                isToday && 'ring-1 ring-[color:var(--neon-violet)]',
                isUsed
                  ? 'bg-white/5 text-muted-foreground'
                  : challenge
                    ? 'bg-[color:var(--neon-violet)]/15 text-white hover:bg-[color:var(--neon-violet)]/25'
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10'
              )}
            >
              <span className="text-xs font-semibold tabular-nums">{Number(date.slice(8, 10))}</span>
              {challenge && <span className="text-[8px] leading-tight line-clamp-2">{challenge.prompt}</span>}
            </button>
          )
        })}
      </div>

      {monthKey === todayDate.slice(0, 7) && (
        <Button size="sm" variant="destructive" className="w-full" onClick={() => setPushDialogOpen(true)}>
          <Zap className="w-3.5 h-3.5 mr-1.5" />
          Push today&apos;s challenge live now
        </Button>
      )}

      <Dialog open={!!dialogDate} onOpenChange={(o) => !o && setDialogDate(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{dialogDate}</DialogTitle></DialogHeader>
          {dialogChallenge ? (
            <div className="space-y-3">
              <p className="text-sm">{dialogChallenge.prompt}</p>
              {dialogChallenge.drop_at ? (
                <p className="text-xs text-muted-foreground">Already used that day — locked.</p>
              ) : (
                <Button size="sm" variant="secondary" disabled={busy} onClick={handleUnschedule}>
                  {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Remove from this date
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {availableChallenges.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unscheduled pool challenges to assign — add one first.</p>
              ) : (
                <>
                  <Select value={selectedChallengeId} onChange={(e) => setSelectedChallengeId(e.target.value)}>
                    <option value="">Choose a challenge…</option>
                    {availableChallenges.map((c) => (
                      <option key={c.id} value={c.id}>{c.prompt.slice(0, 60)}</option>
                    ))}
                  </Select>
                  <Button size="sm" variant="secondary" disabled={busy || !selectedChallengeId} onClick={handleAssign}>
                    {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Schedule
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pushDialogOpen} onOpenChange={(o) => { setPushDialogOpen(o); if (!o) setPushConfirmText('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Push today&apos;s challenge live now?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This drops today&apos;s challenge immediately — skipping the randomized time window entirely. Players will
              be able to answer it right away, and this can&apos;t be undone.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type PUSH to confirm</label>
              <Input value={pushConfirmText} onChange={(e) => setPushConfirmText(e.target.value)} />
            </div>
            <Button
              variant="destructive"
              className="w-full"
              disabled={pushConfirmText !== 'PUSH' || pushBusy}
              onClick={handlePush}
            >
              {pushBusy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Push now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
