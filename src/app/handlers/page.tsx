import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isHandler } from '@/lib/handlers'
import { getAppConfig } from '@/lib/config'
import { etWindowToday } from '@/lib/time'
import HandlerPanel from './HandlerPanel'
import AdminFontScope from '../admin/AdminFontScope'
import type { ChallengeWithAnswer } from '@/lib/types'

export default async function HandlersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase.from('profiles').select('role, badges').eq('id', user.id).single()
  if (!isHandler(profile)) redirect('/')

  const admin = createAdminClient()

  const { data: bots } = await admin
    .from('profiles')
    .select('id, username, display_name, current_streak, longest_streak')
    .eq('is_bot', true)
    .order('display_name', { ascending: true })

  const config = await getAppConfig(admin)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const { data: challenge } = await admin
    .from('challenges')
    .select('*')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()

  let answeredBotIds: string[] = []
  if (challenge) {
    const { data: existing } = await admin
      .from('responses')
      .select('user_id')
      .eq('challenge_id', challenge.id)
      .in('user_id', (bots ?? []).map((b) => b.id))
    answeredBotIds = (existing ?? []).map((r) => r.user_id)
  }

  const { data: feedItems } = await admin
    .from('responses')
    .select('id, answer, photo_url, answered_at, profiles(username, display_name), challenges(prompt)')
    .is('deleted_at', null)
    .order('answered_at', { ascending: false })
    .limit(15)

  return (
    <div className="admin-scope flex-1 px-4 py-8">
      <AdminFontScope />
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-wide">Handlers</h1>
          <p className="text-sm text-muted-foreground">Create bot accounts and post as them — for real, attributed to the bot.</p>
        </div>
        <HandlerPanel
          bots={bots ?? []}
          challenge={challenge as ChallengeWithAnswer | null}
          answeredBotIds={answeredBotIds}
          feedItems={(feedItems ?? []) as unknown as {
            id: string
            answer: string
            photo_url: string | null
            answered_at: string
            profiles: { username: string | null; display_name: string | null } | null
            challenges: { prompt: string } | null
          }[]}
        />
      </div>
    </div>
  )
}
