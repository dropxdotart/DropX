import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trophy } from 'lucide-react'
import type { RoomPlayer } from '@/lib/types'

export default function FinalScores({ players }: { players: RoomPlayer[] }) {
  const ranked = [...players].sort((a, b) => b.score - a.score)

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

      <Link href="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold px-6 hover:opacity-90 transition-opacity">
        Back home
      </Link>
    </div>
  )
}
