import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ModQueue from '@/components/mod/ModQueue'
import SupportPanel from './SupportPanel'
import type { ModQueueItem } from '@/lib/types'

export default async function ModPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const { tab: tabParam, q } = await searchParams
  const tab = tabParam === 'support' ? 'support' : 'queue'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'mod' && profile.role !== 'admin')) {
    redirect('/')
  }

  const { data: items } = await supabase
    .from('responses')
    .select('id, photo_url, answered_at, profiles(username, display_name), challenges(prompt)')
    .eq('moderation_status', 'pending')
    .order('answered_at', { ascending: true })

  const admin = createAdminClient()
  let supportUser: { id: string; username: string | null; display_name: string | null; current_streak: number; longest_streak: number; account_status: string } | null = null
  let streakDays: Awaited<ReturnType<typeof getStreakCalendar>> = []

  if (tab === 'support' && q) {
    const { data: found } = await admin
      .from('profiles')
      .select('id, username, display_name, current_streak, longest_streak, account_status')
      .ilike('username', q)
      .maybeSingle()
    if (found) {
      supportUser = found
      streakDays = await getStreakCalendar(admin, found.id, 60)
    }
  }

  return (
    <div className="flex-1 px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-wide">Moderate</h1>
          <nav className="flex items-center gap-1 mt-3 border-b border-white/10">
            <Link
              href="/mod?tab=queue"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'queue' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Photo queue
            </Link>
            <Link
              href="/mod?tab=support"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'support' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Support
            </Link>
          </nav>
        </div>

        {tab === 'queue' ? (
          <>
            <p className="text-sm text-muted-foreground">Oldest first — these auto-hide if nobody reviews them in time.</p>
            <ModQueue initialItems={(items ?? []) as unknown as ModQueueItem[]} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Look up an account to see their history and fix a streak issue.</p>
            <form className="flex gap-2 max-w-sm" action="/mod">
              <input type="hidden" name="tab" value="support" />
              <Input name="q" defaultValue={q ?? ''} placeholder="Exact @username" />
              <Button type="submit" variant="outline">Search</Button>
            </form>
            {q && !supportUser && <p className="text-sm text-muted-foreground">No user found with that username.</p>}
            {supportUser && <SupportPanel user={supportUser} streakDays={streakDays} />}
          </>
        )}
      </div>
    </div>
  )
}
