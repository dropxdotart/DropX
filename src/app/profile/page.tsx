import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SettingsCard from '@/components/profile/SettingsCard'
import SuggestChallengeCard from '@/components/profile/SuggestChallengeCard'
import DisplayNameEditor from '@/components/profile/DisplayNameEditor'
import AvatarUploader from '@/components/profile/AvatarUploader'
import { Flame, Trophy, ShieldCheck } from 'lucide-react'
import type { AvatarPreset } from '@/lib/types'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: presets } = await supabase
    .from('avatar_presets')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <Card className="border-white/10 bg-card/60 backdrop-blur-sm overflow-visible">
          <CardContent className="flex items-center gap-5">
            <AvatarUploader
              userId={user.id}
              initialAvatarUrl={profile?.avatar_url ?? null}
              fallbackLetter={(profile?.display_name ?? profile?.username)?.[0]?.toUpperCase() ?? 'U'}
              presets={(presets ?? []) as AvatarPreset[]}
            />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <DisplayNameEditor
                  initialName={profile?.display_name ?? profile?.username ?? user.email ?? 'You'}
                  username={profile?.username ?? null}
                  changedAt={profile?.display_name_changed_at ?? null}
                />
                {profile?.role && profile.role !== 'user' && (
                  <Badge className="gap-1 border-0 gradient-hero text-white font-semibold capitalize">
                    <ShieldCheck className="w-3 h-3" />
                    {profile.role}
                  </Badge>
                )}
              </div>
              {profile?.badges && profile.badges.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {profile.badges.map((badge: string) => (
                    <Badge key={badge} variant="secondary" className="text-xs">
                      {badge}
                    </Badge>
                  ))}
                </div>
              )}
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

        <SuggestChallengeCard />

        <SettingsCard
          initialShowEveryone={profile?.show_everyone_tab ?? true}
          initialShareToEveryone={profile?.share_to_everyone ?? true}
          role={profile?.role ?? 'user'}
          badges={profile?.badges ?? []}
        />
      </div>
    </div>
  )
}
