'use client'

import { useState, useTransition } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Trophy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { leaveAllRooms } from '@/app/actions'
import { startNewGame } from '@/app/room/actions'
import GamePicker, { type PickableGame } from '@/components/home/GamePicker'
import type { RoomPlayer } from '@/lib/types'

export default function FinalScores({
  players,
  roomId,
  isHost,
  games,
}: {
  players: RoomPlayer[]
  roomId: string
  isHost: boolean
  games: PickableGame[]
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  const [pickingGame, setPickingGame] = useState(false)
  const [leaving, startLeave] = useTransition()

  const handleLeave = () => {
    startLeave(async () => {
      try {
        await leaveAllRooms()
        window.location.href = '/'
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (pickingGame) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-center">Choose the next game</h1>
        <GamePicker games={games} needsNickname={false} onPick={(gameKey) => startNewGame(roomId, gameKey)} />
      </div>
    )
  }

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1">
        <Trophy className="w-8 h-8 mx-auto text-primary" />
        <h1 className="text-xl font-bold">Game over</h1>
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {ranked.map((p, i) => (
          <div key={p.user_id} className="flex items-center gap-3 p-3">
            <span className="w-5 text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
            <Avatar className="w-8 h-8">
              {p.profiles.avatar_url && <AvatarImage src={p.profiles.avatar_url} alt="" />}
              <AvatarFallback className="bg-secondary text-xs">
                {(p.profiles.display_name ?? p.profiles.username)?.[0]?.toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-left text-sm font-medium truncate">
              {p.profiles.display_name ?? p.profiles.username ?? 'Someone'}
            </span>
            <span className="text-sm font-bold tabular-nums">{p.score}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {isHost ? (
          <Button className="w-full h-12 rounded-xl text-base" onClick={() => setPickingGame(true)}>
            Play another game
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for the host to pick another game&hellip;</p>
        )}
        <Button variant="outline" className="w-full h-11 rounded-xl" onClick={handleLeave} disabled={leaving}>
          {leaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Leave for good
        </Button>
      </div>
    </div>
  )
}
