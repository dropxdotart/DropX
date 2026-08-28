import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import { getAppConfig } from '@/lib/config'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import ModQueue from '@/components/mod/ModQueue'
import TextReviewQueue from '@/components/mod/TextReviewQueue'
import CaptionReviewQueue from '@/components/mod/CaptionReviewQueue'
import ReportsQueue from './ReportsQueue'
import SupportPanel from './SupportPanel'
import type { ModQueueItem, TextReviewItem, CaptionReviewItem } from '@/lib/types'

type ReportItem = {
  id: string
  target_ref: string | null
  reason: string | null
  created_at: string
  reporter: { username: string | null; display_name: string | null } | null
  target: { username: string | null; display_name: string | null } | null
}

export default async function ModPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const { tab: tabParam, q } = await searchParams
  const tab =
    tabParam === 'support' ? 'support' :
    tabParam === 'reports' ? 'reports' :
    tabParam === 'text' ? 'text' :
    tabParam === 'captions' ? 'captions' :
    'queue'

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
    .select('id, photo_url, answered_at, profiles(username, display_name), challenges!inner(prompt, type)')
    .eq('moderation_status', 'pending')
    .eq('challenges.type', 'photo')
    .order('answered_at', { ascending: true })

  // Non-exact text answers (graded, needing a right/wrong call) and
  // captions (ungraded, needing a 1-10 rating) both land in
  // moderation_status='pending' too — challenges.graded is what tells
  // these two queues apart, see submitAnswer/submitCaptionAnswer.
  const { data: textItems } = await supabase
    .from('responses')
    .select('id, answer, answered_at, profiles(username, display_name), challenges!inner(prompt, type, graded)')
    .eq('moderation_status', 'pending')
    .eq('challenges.type', 'text')
    .eq('challenges.graded', true)
    .order('answered_at', { ascending: true })

  const { data: captionItems } = await supabase
    .from('responses')
    .select('id, answer, answered_at, profiles(username, display_name), challenges!inner(prompt, prompt_image_url, type, graded)')
    .eq('moderation_status', 'pending')
    .eq('challenges.type', 'text')
    .eq('challenges.graded', false)
    .order('answered_at', { ascending: true })

  const config = await getAppConfig(supabase)

  const admin = createAdminClient()
  let supportUser: { id: string; username: string | null; display_name: string | null; current_streak: number; longest_streak: number; account_status: string } | null = null
  let streakDays: Awaited<ReturnType<typeof getStreakCalendar>> = []
  let reports: ReportItem[] = []

  if (tab === 'support' && q) {
    const { data: found } = await admin
      .from('profiles')
      .select('id, username, display_name, current_streak, longest_streak, account_status')
      .ilike('username', q.replace(/^@/, ''))
      .maybeSingle()
    if (found) {
      supportUser = found
      streakDays = await getStreakCalendar(admin, found.id, 120)
    }
  }

  if (tab === 'reports') {
    const { data } = await admin
      .from('reports')
      .select(
        'id, target_ref, reason, created_at, reporter:profiles!reporter_id(username, display_name), target:profiles!target_user_id(username, display_name)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    reports = (data ?? []) as unknown as ReportItem[]
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
              href="/mod?tab=text"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'text' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Text review
            </Link>
            <Link
              href="/mod?tab=captions"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'captions' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Captions
            </Link>
            <Link
              href="/mod?tab=reports"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'reports' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Reports
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

        {tab === 'queue' && (
          <>
            <p className="text-sm text-muted-foreground">Oldest first — these auto-hide if nobody reviews them in time.</p>
            <ModQueue initialItems={(items ?? []) as unknown as ModQueueItem[]} graceMinutes={config.photo_grace_minutes} />
          </>
        )}

        {tab === 'text' && (
          <>
            <p className="text-sm text-muted-foreground">Answers that didn&apos;t match exactly — swipe right if it&apos;s close enough, left if it&apos;s not.</p>
            <TextReviewQueue initialItems={(textItems ?? []) as unknown as TextReviewItem[]} />
          </>
        )}

        {tab === 'captions' && (
          <>
            <p className="text-sm text-muted-foreground">Rate each caption 1–10, or remove anything that shouldn&apos;t count.</p>
            <CaptionReviewQueue initialItems={(captionItems ?? []) as unknown as CaptionReviewItem[]} />
          </>
        )}

        {tab === 'reports' && (
          <>
            <p className="text-sm text-muted-foreground">Profile pictures other users have flagged.</p>
            <ReportsQueue initialReports={reports} />
          </>
        )}

        {tab === 'support' && (
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
