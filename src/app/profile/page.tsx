import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Flame, Trophy } from 'lucide-react'

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
        <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex items-center gap-4">
            <Avatar className="w-16 h-16 ring-2 ring-[color:var(--neon-violet)] glow-violet">
              <AvatarFallback className="text-xl bg-secondary">
                {profile?.username?.[0]?.toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-xl truncate">{profile?.username ?? user.email}</CardTitle>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="border-white/10 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Flame className="w-6 h-6 text-[color:var(--neon-orange)]" fill="currentColor" />
                {profile?.current_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Trophy className="w-6 h-6 text-[color:var(--neon-cyan)]" fill="currentColor" />
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
