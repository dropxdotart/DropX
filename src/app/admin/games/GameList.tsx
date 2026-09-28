'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateGame } from './actions'

type Game = {
  id: string
  key: string
  label: string
  description: string
  icon: string
  available: boolean
  is_paid: boolean
  price_cents: number | null
}

export default function GameList({ initialGames }: { initialGames: Game[] }) {
  const [games, setGames] = useState(initialGames)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const patch = (id: string, next: Partial<Game>) => {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, ...next } : g)))
    setBusyId(id)
    startTransition(async () => {
      try {
        await updateGame(id, {
          available: next.available,
          is_paid: next.is_paid,
          price_cents: next.price_cents,
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <h1 className="text-lg font-semibold">Games</h1>
      <p className="text-sm text-muted-foreground -mt-2">
        Controls what shows in the host picker. "Available" means the round type is actually built —
        flipping it on for one that isn't yet will let people select a game with no real gameplay.
      </p>

      <div className="space-y-3">
        {games.map((game) => (
          <div key={game.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl" aria-hidden>{game.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{game.label}</p>
                <p className="text-xs text-muted-foreground truncate">{game.description}</p>
              </div>
              {busyId === game.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
            </div>

            <label className="flex items-center justify-between text-sm">
              Available to play
              <input
                type="checkbox"
                checked={game.available}
                onChange={(e) => patch(game.id, { available: e.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between text-sm">
              Paid game
              <input
                type="checkbox"
                checked={game.is_paid}
                onChange={(e) => patch(game.id, { is_paid: e.target.checked, price_cents: e.target.checked ? (game.price_cents ?? 199) : null })}
              />
            </label>

            {game.is_paid && (
              <label className="flex items-center justify-between text-sm gap-2">
                Price
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={((game.price_cents ?? 0) / 100).toFixed(2)}
                    onChange={(e) => patch(game.id, { price_cents: Math.round(Number(e.target.value) * 100) })}
                    className="h-8 w-20"
                  />
                </div>
              </label>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Marking a game paid only locks it in the picker for now — there's no checkout flow wired up yet.
      </p>
    </div>
  )
}
