'use client'

import { useState, useTransition } from 'react'
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

export default function GamePicker({ games, needsNickname }: { games: PickableGame[]; needsNickname: boolean }) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<PickableGame | null>(null)
  const [name, setName] = useState('')

  const start = (gameKey: string, nickname?: string) => {
    startTransition(async () => {
      try {
        await createRoom(gameKey, nickname)
      } catch (err) {
        if (isRedirectSignal(err)) throw err
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handlePick = (game: PickableGame) => {
    if (!game.available || pending) return
    if (needsNickname) {
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
      {games.map((game) => (
        <button
          key={game.key}
          type="button"
          disabled={!game.available || pending}
          onClick={() => handlePick(game)}
          className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:border-foreground/30 hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-card"
        >
          <span className="text-2xl shrink-0" aria-hidden>{game.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold">
              {game.label}
              {game.is_paid && (
                <span className="text-[10px] font-mono uppercase tracking-wide text-accent border border-accent/40 rounded px-1 py-0.5">
                  {((game.price_cents ?? 0) / 100).toFixed(2)}
                </span>
              )}
            </span>
            <span className="block text-xs text-muted-foreground">
              {game.available ? game.description : 'Coming soon'}
            </span>
          </span>
          {pending && game.available && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        </button>
      ))}
    </div>
  )
}
