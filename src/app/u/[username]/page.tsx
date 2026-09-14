import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Flame, Trophy, ShieldCheck } from 'lucide-react'
import UserAvatar from '@/components/shared/UserAvatar'
import FollowButton from '@/components/shared/FollowButton'
import FollowListDialog from '@/components/shared/FollowListDialog'

// Read-only view of someone else's profile — self-editing (avatar upload,
// display name, settings) stays on /profile, which this redirects to if
// the username turns out to be your own.
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center gap-2">
        <p className="font-medium">User not found</p>
        <p className="text-sm text-muted-foreground">@{username} doesn&apos;t exist.</p>
      </div>
    )
  }

  if (profile.id === user.id) redirect('/profile')

  const [{ count: followerCount }, { count: followingCount }, { data: amFollowing }] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', profile.id),
    supabase.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
    supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('followed_id', profile.id).maybeSingle(),
  ])

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex items-center gap-5">
            <UserAvatar username={profile.display_name ?? profile.username} avatarUrl={profile.avatar_url} size="lg" />
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-bold truncate">{profile.display_name ?? profile.username}</p>
                {profile.role && profile.role !== 'user' && (
                  <Badge className="gap-1 border-0 gradient-hero text-white font-semibold capitalize">
                    <ShieldCheck className="w-3 h-3" />
                    {profile.role}
                  </Badge>
                )}
              </div>
              {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
              {profile.badges && profile.badges.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {profile.badges.map((badge: string) => (
                    <Badge key={badge} variant="secondary" className="text-xs">{badge}</Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
          <CardContent className="flex items-center justify-around py-1">
            <FollowListDialog userId={profile.id} kind="followers" count={followerCount ?? 0} label="Followers" />
            <div className="w-px h-8 bg-white/10" />
            <FollowListDialog userId={profile.id} kind="following" count={followingCount ?? 0} label="Following" />
          </CardContent>
        </Card>

        <FollowButton targetUserId={profile.id} initialFollowing={Boolean(amFollowing)} className="w-full h-11 rounded-xl" />

        <div className="grid grid-cols-2 gap-4">
          <Card className="border-[color:var(--neon-orange)]/25 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Flame className="w-6 h-6 text-[color:var(--neon-orange)] drop-shadow-[0_0_6px_oklch(0.8_0.2_55/0.6)]" fill="currentColor" />
                {profile.current_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </CardContent>
          </Card>
          <Card className="border-[color:var(--neon-cyan)]/25 bg-card/60 backdrop-blur-sm text-center">
            <CardContent className="space-y-1 py-2">
              <div className="flex items-center justify-center gap-1.5 text-3xl font-bold">
                <Trophy className="w-6 h-6 text-[color:var(--neon-cyan)] drop-shadow-[0_0_6px_oklch(0.84_0.17_195/0.6)]" fill="currentColor" />
                {profile.longest_streak ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Longest streak</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
