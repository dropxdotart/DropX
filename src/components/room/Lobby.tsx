'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Loader2, Users, Copy, Check, Play } from 'lucide-react'
import { toast } from 'sonner'
import { startGame } from '@/app/room/actions'
import type { Room, RoomPlayer } from '@/lib/types'

export default function Lobby({ room, players, isHost }: { room: Room; players: RoomPlayer[]; isHost: boolean }) {
  const [starting, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleStart = () => {
    startTransition(async () => {
      try {
        await startGame(room.id)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-1.5">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Room code</p>
        <button
          onClick={handleCopy}
          className="mx-auto flex items-center gap-2.5 font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums px-2 hover:opacity-80 transition-opacity"
        >
          {room.code}
          {copied ? <Check className="w-5 h-5 text-[color:var(--positive)]" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
        </button>
        <p className="text-xs text-muted-foreground">Tap to copy — share it with your friends</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Users className="w-4 h-4" />
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {players.map((p) => (
            <div key={p.user_id} className="flex flex-col items-center gap-1">
              <div className="gradient-ring rounded-full p-[2px]">
                <Avatar className="w-11 h-11 ring-1 ring-background">
                  {p.profiles.avatar_url && <AvatarImage src={p.profiles.avatar_url} alt="" />}
                  <AvatarFallback className="bg-secondary text-sm">
                    {(p.profiles.display_name ?? p.profiles.username)?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-[11px] text-muted-foreground truncate max-w-[4.5rem]">
                {p.profiles.display_name ?? p.profiles.username ?? 'Someone'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <Button className="w-full h-12 rounded-xl text-base" disabled={starting || players.length < 1} onClick={handleStart}>
          {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Start game
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for the host to start&hellip;</p>
      )}
    </div>
  )
}
