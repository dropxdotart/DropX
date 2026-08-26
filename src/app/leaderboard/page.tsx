import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Trophy } from 'lucide-react'

const TEASER_ROWS = [
  { width: '55%' },
  { width: '70%' },
  { width: '45%' },
  { width: '62%' },
  { width: '38%' },
  { width: '58%' },
]

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  return (
    <div className="flex flex-1 flex-col px-4 py-10">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="text-center space-y-1">
          <h1 className="font-heading text-xl font-bold tracking-wide">Leaderboard</h1>
          <p className="text-muted-foreground text-sm">Ranked by points — coming soon.</p>
        </div>

        <div className="relative">
          <Card className="border-white/10 bg-card blur-[3px] select-none pointer-events-none opacity-60">
            <CardContent className="divide-y divide-white/5 p-0">
              {TEASER_ROWS.map((row, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 h-3 rounded-full bg-white/10" style={{ width: row.width }} />
                  <span className="text-sm font-bold text-white tabular-nums">{(600 - i * 80)} pts</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <div className="rounded-full bg-white/5 p-3 glow-violet">
              <Trophy className="w-6 h-6 text-[color:var(--neon-cyan)]" />
            </div>
            <p className="font-heading text-sm font-bold tracking-wide">Coming soon</p>
            <p className="text-xs text-muted-foreground max-w-[220px]">
              Earn points from daily drops and other challenges to climb the board.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
