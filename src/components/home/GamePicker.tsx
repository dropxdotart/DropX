'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { createRoom } from '@/app/actions'

function isRedirectSignal(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err && typeof err.digest === 'string' && err.digest.startsWith('NEXT_REDIRECT')
}

export type PickableGame = {
  key: string
  label: string
  description: string
  icon: string
  available: boolean
  is_paid: boolean
  price_cents: number | null
}

// Cycled by list position rather than tied to a specific game — a new
// catalog entry should still land on a color, not fall back to gray.
const ICON_COLORS = ['var(--fun-pink)', 'var(--fun-teal)', 'var(--fun-violet)', 'var(--fun-yellow)']

// Fixed gameplay copy per round type — not admin-editable like label/
// description, since it's explaining a mechanic rather than marketing
// copy. Shown for "coming soon" games too, so people know what's coming.
const PREVIEWS: Record<string, { example: string; render: () => ReactNode }> = {
  hot_take: {
    example: '“Pineapple belongs on pizza 🍕”',
    render: () => (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <span className="flex-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold text-center py-1.5">
            Agree
          </span>
          <span className="flex-1 rounded-full border-2 border-foreground text-[11px] font-bold text-center py-1.5">
            Disagree
          </span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
          <span className="bg-primary" style={{ width: '62%' }} />
          <span className="bg-foreground/70" style={{ width: '38%' }} />
        </div>
      </div>
    ),
  },
  who_said_it: {
    example: '“I once ate a whole pizza by myself”',
    render: () => (
      <div className="flex items-center gap-1.5">
        <span className="flex-1 rounded-xl bg-muted px-3 py-2 text-[11px] italic text-foreground/70">
          Who said it?
        </span>
        <span className="flex -space-x-1.5 shrink-0">
          {['var(--fun-pink)', 'var(--fun-teal)', 'var(--fun-violet)'].map((c) => (
            <span key={c} className="w-5 h-5 rounded-full ring-2 ring-card" style={{ backgroundColor: c }} />
          ))}
        </span>
      </div>
    ),
  },
  caption: {
    example: '“when the wifi finally works”',
    render: () => (
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-9 h-7 rounded-lg bg-muted text-sm shrink-0" aria-hidden>
          🖼️
        </span>
        <span className="flex-1 rounded-xl bg-muted px-3 py-2 text-[11px] italic text-foreground/70">
          Vote for the funniest
        </span>
      </div>
    ),
  },
}

export default function GamePicker({
  games,
  needsNickname,
  onPick,
}: {
  games: PickableGame[]
  needsNickname: boolean
  // Set when reusing this picker for "play another game" in an existing
  // room — identity's already established there, so it skips straight past
  // the nickname flow entirely instead of just not needing to ask.
  onPick?: (gameKey: string) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<PickableGame | null>(null)
  const [name, setName] = useState('')

  const start = (gameKey: string, nickname?: string) => {
    startTransition(async () => {
      try {
        if (onPick) await onPick(gameKey)
        else await createRoom(gameKey, nickname)
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handlePick = (game: PickableGame) => {
    if (!game.available || pending) return
    if (needsNickname && !onPick) {
      setSelected(game)
      return
    }
    start(game.key)
  }

  const handleConfirmName = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !name.trim() || pending) return
    start(selected.key, name)
  }

  if (selected) {
    return (
      <form onSubmit={handleConfirmName} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Playing <span className="text-foreground font-medium">{selected.label}</span> — what should we call you?
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={24}
          disabled={pending}
          autoFocus
          className="h-12 rounded-xl text-center text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl px-4"
            disabled={pending}
            onClick={() => setSelected(null)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button type="submit" className="flex-1 h-12 rounded-xl text-base" disabled={pending || !name.trim()}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Start
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      {games.map((game, i) => {
        const preview = PREVIEWS[game.key]
        return (
          <button
            key={game.key}
            type="button"
            disabled={!game.available || pending}
            onClick={() => handlePick(game)}
            className="w-full rounded-2xl border-2 border-border bg-card p-4 text-left transition-all hover:border-foreground hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:border-border disabled:hover:translate-y-0"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex items-center justify-center w-11 h-11 rounded-xl text-xl shrink-0"
                style={{ backgroundColor: ICON_COLORS[i % ICON_COLORS.length] }}
                aria-hidden
              >
                {game.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-bold">
                  {game.label}
                  {game.is_paid && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5">
                      {((game.price_cents ?? 0) / 100).toFixed(2)}
                    </span>
                  )}
                  {!game.available && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{game.description}</span>
              </span>
              {pending && game.available && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            </div>

            {preview && (
              <div className="mt-3 pl-[3.5rem] space-y-1.5">
                <p className="text-[11px] text-muted-foreground">{preview.example}</p>
                {preview.render()}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
