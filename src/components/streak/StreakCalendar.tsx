'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Loader2, Check, X, RotateCcw } from 'lucide-react'
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
            <p className="text-2xl font-bold text-white">{currentStreak}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Longest</p>
            <p className="text-2xl font-bold text-white">{longestStreak}</p>
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

      <div className="rounded-lg border border-white/10 bg-black/20 divide-y divide-white/5 max-h-72 overflow-y-auto">
        {days.map((d) => (
          <div key={d.date} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span className="text-white/90 tabular-nums">{d.date}</span>
            <div className="flex items-center gap-2">
              {d.overridden && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 text-muted-foreground">
                  edited
                </Badge>
              )}
              <Badge
                variant="secondary"
                className={cn('text-[10px] px-1.5 py-0', d.counts ? 'text-green-400' : 'text-muted-foreground')}
              >
                {d.counts ? 'Counted' : d.hasResponse ? 'Missed' : '—'}
              </Badge>
              {editable && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Mark as counted"
                    disabled={pendingKey === d.date}
                    onClick={() => run(d.date, () => onToggleDay!(d.date, true))}
                    className={cn(
                      'p-1 rounded hover:bg-white/10 transition-colors',
                      d.counts ? 'text-green-400' : 'text-muted-foreground'
                    )}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Mark as not counted"
                    disabled={pendingKey === d.date}
                    onClick={() => run(d.date, () => onToggleDay!(d.date, false))}
                    className={cn(
                      'p-1 rounded hover:bg-white/10 transition-colors',
                      !d.counts ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {d.overridden && onResetDay && (
                    <button
                      type="button"
                      title="Reset to actual answer"
                      disabled={pendingKey === d.date}
                      onClick={() => run(d.date, () => onResetDay(d.date))}
                      className="p-1 rounded hover:bg-white/10 text-muted-foreground transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
