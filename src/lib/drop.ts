import type { SupabaseClient } from '@supabase/supabase-js'
import { etDateToday } from './time'

export type DropCheckResult =
  | { status: 'already_dropped' }
  | { status: 'pool_empty' }
  | { status: 'ready'; challengeId: string; scheduled: boolean }

// Shared by the cron route (random time within the window) and the admin
// "push now" action (immediately) — both need the exact same "what would
// drop today" answer, so there's one place that can diverge from the other.
export async function findTodaysDrop(supabase: SupabaseClient, start: Date, end: Date): Promise<DropCheckResult> {
  const { data: alreadyDropped } = await supabase
    .from('challenges')
    .select('id')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()

  if (alreadyDropped) return { status: 'already_dropped' }

  const { data: scheduled } = await supabase
    .from('challenges')
    .select('id')
    .eq('scheduled_date', etDateToday())
    .is('drop_at', null)
    .maybeSingle()

  const { data: next } = scheduled
    ? { data: scheduled }
    : await supabase
        .from('challenges')
        .select('id')
        .is('drop_at', null)
        .is('scheduled_date', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

  if (!next) return { status: 'pool_empty' }

  return { status: 'ready', challengeId: next.id, scheduled: !!scheduled }
}
