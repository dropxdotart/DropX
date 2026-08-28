import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { ADMIN_ACTION_LABELS } from '@/lib/audit'

type DeletionEntry = {
  kind: 'deletion'
  id: string
  created_at: string
  response_id: string
  user: { id: string; username: string | null; display_name: string | null } | null
  response: {
    answer: string
    photo_url: string | null
    is_correct: boolean | null
    challenges: { prompt: string } | null
  } | null
}

type ActionEntry = {
  kind: 'action'
  id: string
  created_at: string
  action: string
  detail: string | null
  actor: { username: string | null; display_name: string | null } | null
  target: { id: string; username: string | null; display_name: string | null } | null
}

type FeedEntry = DeletionEntry | ActionEntry

export default async function AdminAuditPage() {
  const supabase = createAdminClient()

  const [{ data: deletions }, { data: actions }] = await Promise.all([
    supabase
      .from('response_deletions')
      .select(
        'id, created_at, response_id, user:profiles!user_id(id, username, display_name), response:responses(answer, photo_url, is_correct, challenges(prompt))'
      )
      .order('created_at', { ascending: false })
      .limit(75),
    // answer_deleted duplicates the richer deletion card below (same event,
    // logged twice — once for this page's detail, once for the per-user
    // Activity feed on their own profile) — excluded here to avoid showing
    // the same deletion twice in one feed.
    supabase
      .from('admin_actions')
      .select('id, created_at, action, detail, actor:profiles!actor_id(username, display_name), target:profiles!target_user_id(id, username, display_name)')
      .neq('action', 'answer_deleted')
      .order('created_at', { ascending: false })
      .limit(150),
  ])

  const entries: FeedEntry[] = [
    ...((deletions ?? []) as unknown as Omit<DeletionEntry, 'kind'>[]).map((d) => ({ kind: 'deletion' as const, ...d })),
    ...((actions ?? []) as unknown as Omit<ActionEntry, 'kind'>[]).map((a) => ({ kind: 'action' as const, ...a })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{entries.length} event{entries.length === 1 ? '' : 's'}</p>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {entries.length === 0 && <p className="p-4 text-sm text-muted-foreground">No activity yet.</p>}
        {entries.map((entry) =>
          entry.kind === 'deletion' ? (
            <div key={`d-${entry.id}`} className="flex items-center gap-3 p-2.5">
              {entry.response?.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                <img src={entry.response.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-medium">{entry.user?.display_name ?? entry.user?.username ?? 'Someone'}</span>{' '}
                  deleted their answer to{' '}
                  <span className="text-muted-foreground">&ldquo;{entry.response?.challenges?.prompt ?? 'a challenge'}&rdquo;</span>
                  {entry.response?.is_correct !== null && (
                    <Badge
                      variant="secondary"
                      className={
                        'ml-2 text-[10px] px-1.5 py-0 ' + (entry.response?.is_correct ? 'text-green-400' : 'text-destructive')
                      }
                    >
                      was {entry.response?.is_correct ? 'correct' : 'incorrect'}
                    </Badge>
                  )}
                </p>
                {entry.response?.answer && !entry.response.photo_url && (
                  <p className="text-xs text-muted-foreground truncate">Answered: {entry.response.answer}</p>
                )}
                <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div key={`a-${entry.id}`} className="p-2.5 text-sm">
              <p>
                <span className="font-medium">{entry.actor?.display_name ?? entry.actor?.username ?? 'Someone'}</span>{' '}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 mx-1">{ADMIN_ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                {entry.target && (
                  <>
                    {' — '}
                    <Link href={`/admin/users/${entry.target.id}`} className="text-muted-foreground hover:text-foreground underline underline-offset-2">
                      {entry.target.display_name ?? entry.target.username ?? 'a user'}
                    </Link>
                  </>
                )}
              </p>
              {entry.detail && <p className="text-xs text-muted-foreground">{entry.detail}</p>}
              <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
