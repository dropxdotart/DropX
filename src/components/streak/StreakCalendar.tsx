'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { StreakDay } from '@/lib/streak'

type Props = {
  currentStreak: number
  longestStreak: number
  days: StreakDay[]
  onExtendToToday: () => Promise<void>
  onToggleDay?: (date: string, counts: boolean) => Promise<void>
  onResetDay?: (date: string) => Promise<void>
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function buildMonthCells(monthKey: string, byDate: Map<string, StreakDay>): (StreakDay | null)[] {
  const [year, month] = monthKey.split('-').map(Number)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const cells: (StreakDay | null)[] = Array(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    cells.push(byDate.get(date) ?? { date, counts: false, overridden: false, hasResponse: false })
  }
  return cells
}

export default function StreakCalendar({
  currentStreak,
  longestStreak,
  days,
  onExtendToToday,
  onToggleDay,
  onResetDay,
}: Props) {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const editable = Boolean(onToggleDay)

  const { byDate, monthKeys } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]))
    const monthKeys = Array.from(new Set(days.map((d) => d.date.slice(0, 7)))).sort()
    return { byDate, monthKeys }
  }, [days])

  const [monthIndex, setMonthIndex] = useState(monthKeys.length - 1)
  const monthKey = monthKeys[monthIndex] ?? days[0]?.date.slice(0, 7)
  const cells = monthKey ? buildMonthCells(monthKey, byDate) : []

  const run = (key: string, fn: () => Promise<void>) => {
    setPendingKey(key)
    fn()
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'))
      .finally(() => setPendingKey(null))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div className="flex gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current streak</p>
            <p className="text-2xl font-bold text-foreground">{currentStreak}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Longest</p>
            <p className="text-2xl font-bold text-foreground">{longestStreak}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pendingKey === 'extend'}
          onClick={() => run('extend', onExtendToToday)}
        >
          {pendingKey === 'extend' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Extend to today
        </Button>
      </div>

      {monthKey && (
        <div className="rounded-lg border border-border bg-muted p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              disabled={monthIndex === 0}
              onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
              className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-medium">{monthLabel(monthKey)}</p>
            <button
              type="button"
              disabled={monthIndex === monthKeys.length - 1}
              onClick={() => setMonthIndex((i) => Math.min(monthKeys.length - 1, i + 1))}
              className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
            {WEEKDAY_LABELS.map((w, i) => <div key={i}>{w}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={i} />
              const dayNum = Number(cell.date.slice(8, 10))
              const key = cell.date
              const isPending = pendingKey === key
              // Click activates a day (counts=true); click again to deactivate
              // (counts=false) — a plain toggle, not a click-vs-hover trick, so
              // there's nothing ambiguous about what a click does. Resetting an
              // override back to the real answer is a separate, small,
              // always-visible control so it can never intercept a click meant
              // for the cell itself.
              return (
                <div key={key} className="relative">
                  <button
                    type="button"
                    disabled={!editable || isPending}
                    onClick={() => editable && onToggleDay && run(key, () => onToggleDay(key, !cell.counts))}
                    title={cell.counts ? 'Counts toward the streak — click to remove' : cell.hasResponse ? 'Missed — click to count it' : 'No activity — click to count it'}
                    className={cn(
                      'w-full aspect-square rounded-md text-xs font-medium flex items-center justify-center transition-colors',
                      cell.counts
                        ? 'bg-[color:var(--positive)]/20 text-[color:var(--positive)]'
                        : cell.hasResponse
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-foreground/5 text-muted-foreground',
                      editable && !isPending && 'hover:ring-1 hover:ring-foreground/20 cursor-pointer',
                      isPending && 'opacity-50'
                    )}
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : dayNum}
                  </button>
                  {cell.overridden && onResetDay && editable ? (
                    <button
                      type="button"
                      title="Reset to actual answer"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        run(key, () => onResetDay(key))
                      }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[color:var(--neon-violet)] ring-1 ring-background flex items-center justify-center hover:brightness-125"
                    >
                      <RotateCcw className="w-2.5 h-2.5 text-white" />
                    </button>
                  ) : (
                    cell.overridden && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[color:var(--neon-violet)] ring-1 ring-background" />
                    )
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--positive)]/25" /> Counted</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/20" /> Missed</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[color:var(--neon-violet)]" /> Edited</span>
          </div>
        </div>
      )}
    </div>
  )
}
