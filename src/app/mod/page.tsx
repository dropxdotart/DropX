import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStreakCalendar } from '@/lib/streak'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CaptionReviewQueue from '@/components/mod/CaptionReviewQueue'
import DareReviewQueue from '@/components/mod/DareReviewQueue'
import ReportsQueue from './ReportsQueue'
import SupportPanel from './SupportPanel'
import type { CaptionQueueItem, DareQueueItem } from '@/lib/types'

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
    tabParam === 'dares' ? 'dares' :
    'captions'

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

  const { data: captionItems } = await supabase
    .from('caption_responses')
    .select('id, caption, submitted_at, profiles(username, display_name), drops!inner(prompt, caption_details(image_url))')
    .eq('moderation_status', 'pending')
    .order('submitted_at', { ascending: true })

  const { data: dareItems } = await supabase
    .from('dare_submissions')
    .select('id, video_url, counted_reps, submitted_at, profiles(username, display_name), drops!inner(prompt)')
    .eq('moderation_status', 'pending')
    .order('submitted_at', { ascending: true })

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
              href="/mod?tab=captions"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'captions' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Captions
            </Link>
            <Link
              href="/mod?tab=dares"
              className={cn(
                'px-3 py-2 text-sm border-b-2 transition-colors',
                tab === 'dares' ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
              )}
            >
              Dares
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

        {tab === 'captions' && (
          <>
            <p className="text-sm text-muted-foreground">Rate each caption 1–10, or remove anything that shouldn&apos;t count.</p>
            <CaptionReviewQueue initialItems={(captionItems ?? []) as unknown as CaptionQueueItem[]} />
          </>
        )}

        {tab === 'dares' && (
          <>
            <p className="text-sm text-muted-foreground">Swipe right if the dare's really done, left if not.</p>
            <DareReviewQueue initialItems={(dareItems ?? []) as unknown as DareQueueItem[]} />
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
