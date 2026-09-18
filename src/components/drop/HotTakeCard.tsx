'use client'

import { useState } from 'react'
import { Flame } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { submitHotTakeVote, getHotTakeCounts } from '@/app/actions'

type Props = {
  dropId: string
  prompt: string
  optionA: string
  optionB: string
  initialChoice: 'a' | 'b' | null
  initialCounts: { a: number; b: number } | null
  currentStreak: number | null
}

// Voting and the results reveal are one component (not two screens) so the
// reveal can animate in from the vote itself, rather than a hard page
// transition — the bars grow into place instead of just appearing.
export default function HotTakeCard({
  dropId,
  prompt,
  optionA,
  optionB,
  initialChoice,
  initialCounts,
  currentStreak: initialStreak,
}: Props) {
  const [choice, setChoice] = useState(initialChoice)
  const [counts, setCounts] = useState(initialCounts)
  const [voting, setVoting] = useState<'a' | 'b' | null>(null)
  const [streak, setStreak] = useState(initialStreak)

  const vote = async (pick: 'a' | 'b') => {
    if (voting || choice) return
    setVoting(pick)
    try {
      const [{ currentStreak }, freshCounts] = await Promise.all([
        submitHotTakeVote(dropId, pick),
        getHotTakeCounts(dropId),
      ])
      setChoice(pick)
      setCounts(freshCounts)
      setStreak(currentStreak)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setVoting(null)
    }
  }

  const total = counts ? counts.a + counts.b : 0
  const pctA = total > 0 ? Math.round((counts!.a / total) * 100) : 50
  const pctB = 100 - pctA

  return (
    <div className="w-full max-w-sm space-y-6">
      <p className="text-xl font-semibold text-center leading-snug">{prompt}</p>

      {!choice ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={voting !== null}
            onClick={() => vote('a')}
            className="h-24 rounded-2xl border border-border bg-card hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-60 flex items-center justify-center text-center px-3 text-base font-medium"
          >
            {optionA}
          </button>
          <button
            type="button"
            disabled={voting !== null}
            onClick={() => vote('b')}
            className="h-24 rounded-2xl border border-border bg-card hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-60 flex items-center justify-center text-center px-3 text-base font-medium"
          >
            {optionB}
          </button>
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ResultBar label={optionA} pct={pctA} mine={choice === 'a'} />
          <ResultBar label={optionB} pct={pctB} mine={choice === 'b'} />
          <p className="text-xs text-muted-foreground text-center">
            {total} {total === 1 ? 'vote' : 'votes'} so far
          </p>
        </div>
      )}

      {streak !== null && choice && (
        <p className="text-sm text-center text-muted-foreground">
          <Flame className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {streak} day streak
        </p>
      )}
    </div>
  )
}

function ResultBar({ label, pct, mine }: { label: string; pct: number; mine: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {label}
          {mine && <span className="text-muted-foreground"> · you</span>}
        </span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', mine ? 'bg-primary' : 'bg-muted-foreground/40')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
