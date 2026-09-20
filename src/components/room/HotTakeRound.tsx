'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { castHotTakeVote, getMyHotTakeVote, getHotTakeCounts, revealRound, nextRound } from '@/app/room/actions'
import type { Round } from '@/lib/types'

export default function HotTakeRound({ round }: { round: Round }) {
  const [myChoice, setMyChoice] = useState<'a' | 'b' | null>(null)
  const [counts, setCounts] = useState<{ a: number; b: number } | null>(null)
  const [voting, setVoting] = useState<'a' | 'b' | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const revealed = round.status === 'revealed'

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    Promise.all([getMyHotTakeVote(round.id), revealed ? getHotTakeCounts(round.id) : Promise.resolve(null)]).then(
      ([vote, c]) => {
        if (cancelled) return
        setMyChoice(vote)
        setCounts(c)
        setLoaded(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [round.id, round.status, revealed])

  const vote = async (choice: 'a' | 'b') => {
    if (voting || myChoice) return
    setVoting(choice)
    try {
      await castHotTakeVote(round.id, choice)
      setMyChoice(choice)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setVoting(null)
    }
  }

  const handleReveal = async () => {
    setBusy(true)
    try {
      await revealRound(round.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      // Always clears, success or failure — round.id stays the same on
      // success (this round just moved to 'revealed'), so leaving busy
      // true here would permanently disable the button that same render
      // ever produces next (there's no unmount to reset state for us).
      setBusy(false)
    }
  }

  const handleNext = async () => {
    setBusy(true)
    try {
      await nextRound(round.room_id, round.round_index)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  const total = counts ? counts.a + counts.b : 0
  const pctA = total > 0 ? Math.round((counts!.a / total) * 100) : 50
  const pctB = 100 - pctA

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Hot take · Round {round.round_index + 1}</p>
        <p className="text-xl font-semibold leading-snug">{round.prompt}</p>
      </div>

      {!revealed ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={voting !== null || myChoice !== null}
            onClick={() => vote('a')}
            className={cn(
              'h-24 rounded-2xl border bg-card hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-60 flex items-center justify-center text-center px-3 text-base font-medium',
              myChoice === 'a' ? 'border-primary ring-1 ring-primary' : 'border-border'
            )}
          >
            {round.option_a}
          </button>
          <button
            type="button"
            disabled={voting !== null || myChoice !== null}
            onClick={() => vote('b')}
            className={cn(
              'h-24 rounded-2xl border bg-card hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-60 flex items-center justify-center text-center px-3 text-base font-medium',
              myChoice === 'b' ? 'border-primary ring-1 ring-primary' : 'border-border'
            )}
          >
            {round.option_b}
          </button>
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <ResultBar label={round.option_a ?? ''} pct={pctA} mine={myChoice === 'a'} />
          <ResultBar label={round.option_b ?? ''} pct={pctB} mine={myChoice === 'b'} />
          <p className="text-xs text-muted-foreground text-center">{total} {total === 1 ? 'vote' : 'votes'}</p>
        </div>
      )}

      {!revealed && myChoice && (
        <button
          type="button"
          disabled={busy}
          onClick={handleReveal}
          className="w-full h-11 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-60"
        >
          You&apos;ve voted — reveal results for everyone
        </button>
      )}

      {revealed && (
        <button
          type="button"
          disabled={busy}
          onClick={handleNext}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          Next round
        </button>
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
