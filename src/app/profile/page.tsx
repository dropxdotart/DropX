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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center space-y-3">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-xl">
              {profile?.username?.[0]?.toUpperCase() ?? 'U'}
            </AvatarFallback>
          </Avatar>
          <CardTitle>{profile?.username ?? user.email}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold">
                <Flame className="w-5 h-5 text-orange-500" />
                {profile?.current_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold">
                <Trophy className="w-5 h-5 text-yellow-500" />
                {profile?.longest_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Longest streak</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
