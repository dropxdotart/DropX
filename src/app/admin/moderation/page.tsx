import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import ReverseButton from './ReverseButton'
import type { ModerationLogEntry } from '@/lib/types'

type TargetInfo = {
  imageUrl: string | null
  profile: { username: string | null; display_name: string | null } | null
}

export default async function AdminModerationPage() {
  const supabase = createAdminClient()

  const { data: log } = await supabase
    .from('moderation_log')
    .select('id, target_type, target_id, moderator_id, decision, created_at, moderator:profiles!moderator_id(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const entries = (log ?? []) as unknown as ModerationLogEntry[]

  // moderation_log is polymorphic (no FK to join through), so the two
  // target tables get fetched separately and merged in here rather than
  // via a single PostgREST query.
  const captionIds = entries.filter((e) => e.target_type === 'caption_response').map((e) => e.target_id)
  const dareIds = entries.filter((e) => e.target_type === 'dare_submission').map((e) => e.target_id)

  const [{ data: captions }, { data: dares }] = await Promise.all([
    captionIds.length
      ? supabase.from('caption_responses').select('id, drops(caption_details(image_url)), profiles(username, display_name)').in('id', captionIds)
      : Promise.resolve({ data: [] as never[] }),
    dareIds.length
      ? supabase.from('dare_submissions').select('id, video_url, profiles(username, display_name)').in('id', dareIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const targetInfo = new Map<string, TargetInfo>()
  for (const c of (captions ?? []) as unknown as { id: string; drops: { caption_details: { image_url: string } | null } | null; profiles: TargetInfo['profile'] }[]) {
    targetInfo.set(c.id, { imageUrl: c.drops?.caption_details?.image_url ?? null, profile: c.profiles })
  }
  for (const d of (dares ?? []) as unknown as { id: string; video_url: string; profiles: TargetInfo['profile'] }[]) {
    targetInfo.set(d.id, { imageUrl: null, profile: d.profiles })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{entries.length} decision{entries.length === 1 ? '' : 's'}</p>
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {entries.map((entry) => {
          const info = targetInfo.get(entry.target_id)
          return (
            <div key={entry.id} className="flex items-center gap-3 p-2.5">
              {info?.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                <img src={info.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <span className="font-medium">
                    {info?.profile?.display_name ?? info?.profile?.username ?? 'Someone'}
                  </span>{' '}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {entry.target_type === 'caption_response' ? 'Caption' : 'Dare'}
                  </Badge>{' '}
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
              <ReverseButton targetType={entry.target_type} targetId={entry.target_id} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
