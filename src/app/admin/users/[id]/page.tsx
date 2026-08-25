import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import { Card, CardContent } from '@/components/ui/card'
import UserDetailControls from '../UserDetailControls'
import type { Profile, Strike } from '@/lib/types'

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

  const streakDays = await getStreakCalendar(supabase, id, 60)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{profile.display_name ?? profile.username ?? 'Someone'}</h2>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
      </div>

      <UserDetailControls profile={profile as Profile} streakDays={streakDays} />

      <Card className="border-white/10 bg-card">
        <CardContent className="space-y-2 pt-4">
          <h3 className="text-sm font-medium">Strike history</h3>
          {(strikes ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No strikes.</p>
          ) : (
            <div className="space-y-2">
              {(strikes as unknown as (Strike & { issuer: { username: string | null; display_name: string | null } })[]).map((s) => (
                <div key={s.id} className="text-xs border-b border-white/5 pb-2 last:border-0">
                  <p className="text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()} — by{' '}
                    {s.issuer?.display_name ?? s.issuer?.username ?? 'Someone'}
                  </p>
                  {s.reason && <p>{s.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
