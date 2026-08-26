import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { etWindowToday } from '@/lib/time'
import { getAppConfig } from '@/lib/config'
import { findTodaysDrop } from '@/lib/drop'

// Fired once daily by Vercel Cron (see vercel.json), safely after the window
// opens. Prefers a challenge an admin scheduled for today (challenges.
// scheduled_date); if none, falls back to the oldest un-dropped pool item,
// same as before. Either way it gets a random drop_at somewhere inside
// today's admin-configurable ET window, so the exact moment stays unknown
// to players until it happens (see challenges RLS). An admin can also force
// this early via "push now" in /admin/challenges (src/app/admin/challenges/actions.ts).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const config = await getAppConfig(supabase)
  const { start, end, now } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  if (now < start || now > end) {
    return NextResponse.json({ skipped: 'outside drop window' })
  }

  const result = await findTodaysDrop(supabase, start, end)
  if (result.status === 'already_dropped') return NextResponse.json({ skipped: 'already dropped today' })
  if (result.status === 'pool_empty') return NextResponse.json({ skipped: 'pool is empty' })

  const dropAt = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))

  const { error } = await supabase
    .from('challenges')
    .update({ drop_at: dropAt.toISOString() })
    .eq('id', result.challengeId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ dropped: result.challengeId, drop_at: dropAt.toISOString(), scheduled: result.scheduled })
}
