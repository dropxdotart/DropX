import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import UserDetailControls from '../UserDetailControls'
import StrikeHistory from '../StrikeHistory'
import type { Profile, Strike } from '@/lib/types'

type StrikeWithIssuer = Strike & { issuer: { username: string | null; display_name: string | null } | null }

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
    .select('id, reason, created_at, issued_by, issuer:profiles!issued_by(username, display_name)')
    .eq('user_id', id)
    .order('created_at', { ascending: false })

  const streakDays = await getStreakCalendar(supabase, id, 120)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{profile.display_name ?? profile.username ?? 'Someone'}</h2>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
      </div>

      <UserDetailControls profile={profile as Profile} streakDays={streakDays} />

      <StrikeHistory strikes={(strikes ?? []) as unknown as StrikeWithIssuer[]} />
    </div>
  )
}
