import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import UserDetailControls from '../UserDetailControls'
import { RoleBadge, StatusBadge, UserAvatar } from '../UserBadges'
import type { Profile, Strike, AdminAction } from '@/lib/types'

type StrikeWithIssuer = Strike & {
  issuer: { username: string | null; display_name: string | null } | null
  revoker: { username: string | null; display_name: string | null } | null
}
type ActionWithActor = AdminAction & { actor: { username: string | null; display_name: string | null } | null }

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Authorization already happened in the admin layout — reads below use the
  // admin client deliberately, not the caller's session, so an admin viewing
  // someone else's data isn't silently filtered by that user's own privacy
  // RLS (the same class of bug fixed earlier in /admin/moderation).
  const supabase = createAdminClient()

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (!profile) notFound()

  const { data: strikes } = await supabase
    .from('strikes')
    .select(
      'id, reason, created_at, issued_by, issuer:profiles!issued_by(username, display_name), revoked_at, revoked_by, revoker:profiles!revoked_by(username, display_name)'
    )
    .eq('user_id', id)
    .order('created_at', { ascending: false })

  const { data: actions } = await supabase
    .from('admin_actions')
    .select('id, action, detail, created_at, actor_id, actor:profiles!actor_id(username, display_name)')
    .eq('target_user_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  const streakDays = await getStreakCalendar(supabase, id, 120)
  const name = profile.display_name ?? profile.username ?? 'Someone'

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <UserAvatar name={name} role={profile.role} />
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-lg font-semibold">{name}</h2>
            <RoleBadge role={profile.role} />
            {profile.account_status !== 'active' && <StatusBadge status={profile.account_status} />}
          </div>
          {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
        </div>
      </div>

      <UserDetailControls
        profile={profile as Profile}
        streakDays={streakDays}
        strikes={(strikes ?? []) as unknown as StrikeWithIssuer[]}
        actions={(actions ?? []) as unknown as ActionWithActor[]}
      />
    </div>
  )
}
