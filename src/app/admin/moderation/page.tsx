import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import ReverseButton from './ReverseButton'
import type { ModerationLogEntry } from '@/lib/types'

export default async function AdminModerationPage() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('moderation_log')
    .select(
      'id, response_id, moderator_id, decision, created_at, moderator:profiles!moderator_id(username, display_name), response:responses(user_id, photo_url, profiles(username, display_name))'
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const entries = (log ?? []) as unknown as ModerationLogEntry[]

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{entries.length} decision{entries.length === 1 ? '' : 's'}</p>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 p-2.5">
            {entry.response.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
              <img src={entry.response.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p>
                <span className="font-medium">
                  {entry.response.profiles?.display_name ?? entry.response.profiles?.username ?? 'Someone'}
                </span>{' '}
                <Badge
                  variant="secondary"
                  className={
                    'text-[10px] px-1.5 py-0 capitalize ' +
                    (entry.decision === 'approved' ? 'text-green-400' : 'text-destructive')
                  }
                >
                  {entry.decision}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                by {entry.moderator?.display_name ?? entry.moderator?.username ?? 'Someone'} ·{' '}
                {new Date(entry.created_at).toLocaleString()}
              </p>
            </div>
            <ReverseButton responseId={entry.response_id} />
          </div>
        ))}
      </div>
    </div>
  )
}
