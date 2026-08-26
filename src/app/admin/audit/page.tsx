import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'

type DeletionRow = {
  id: string
  created_at: string
  response_id: string
  user: { username: string | null; display_name: string | null } | null
  response: {
    answer: string
    photo_url: string | null
    is_correct: boolean | null
    challenges: { prompt: string } | null
  } | null
}

export default async function AdminAuditPage() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('response_deletions')
    .select(
      'id, created_at, response_id, user:profiles!user_id(username, display_name), response:responses(answer, photo_url, is_correct, challenges(prompt))'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const entries = (log ?? []) as unknown as DeletionRow[]

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{entries.length} deletion{entries.length === 1 ? '' : 's'}</p>
      <div className="rounded-xl border border-white/10 bg-card divide-y divide-white/5">
        {entries.length === 0 && <p className="p-4 text-sm text-muted-foreground">No answers have been deleted.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 p-2.5">
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
        ))}
      </div>
    </div>
  )
}
