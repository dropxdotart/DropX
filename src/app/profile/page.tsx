import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Flame, Trophy, Sparkles } from 'lucide-react'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <Card className="border-white/10 bg-card/60 backdrop-blur-sm overflow-visible">
          <CardContent className="flex items-center gap-5">
            <div className="relative glow-violet rounded-full shrink-0">
              <Sparkles className="absolute -top-2.5 -left-3 w-4 h-4 text-[color:var(--neon-pink)]" fill="currentColor" />
              <Sparkles className="absolute top-1 -right-3 w-2.5 h-2.5 text-[color:var(--neon-orange)]" fill="currentColor" />
              <Sparkles className="absolute -bottom-2 -right-2 w-3.5 h-3.5 text-[color:var(--neon-cyan)]" fill="currentColor" />
              <Sparkles className="absolute -bottom-1 left-0 w-2 h-2 text-[color:var(--neon-violet)]" fill="currentColor" />
              <div className="gradient-ring rounded-full p-1">
                <Avatar className="w-24 h-24 ring-2 ring-background">
                  <AvatarFallback className="text-3xl bg-secondary">
                    {profile?.username?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl truncate">{profile?.username ?? user.email}</CardTitle>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="border-[color:var(--neon-orange)]/25 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Flame className="w-6 h-6 text-[color:var(--neon-orange)] drop-shadow-[0_0_6px_oklch(0.8_0.2_55/0.6)]" fill="currentColor" />
                {profile?.current_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </CardContent>
          </Card>
          <Card className="border-[color:var(--neon-cyan)]/25 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Trophy className="w-6 h-6 text-[color:var(--neon-cyan)] drop-shadow-[0_0_6px_oklch(0.84_0.17_195/0.6)]" fill="currentColor" />
                {profile?.longest_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Longest streak</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
