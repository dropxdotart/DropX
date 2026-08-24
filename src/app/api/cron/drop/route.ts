import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { etWindowToday, etDateToday } from '@/lib/time'
import { getAppConfig } from '@/lib/config'

// Fired once daily by Vercel Cron (see vercel.json), safely after the window
// opens. Prefers a challenge an admin scheduled for today (challenges.
// scheduled_date); if none, falls back to the oldest un-dropped pool item,
// same as before. Either way it gets a random drop_at somewhere inside
// today's admin-configurable ET window, so the exact moment stays unknown
// to players until it happens (see challenges RLS).
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

  const { data: alreadyDropped } = await supabase
    .from('challenges')
    .select('id')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()

  if (alreadyDropped) {
    return NextResponse.json({ skipped: 'already dropped today' })
  }

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

  if (!next) {
    return NextResponse.json({ skipped: 'pool is empty' })
  }

  const dropAt = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))

  const { error } = await supabase
    .from('challenges')
    .update({ drop_at: dropAt.toISOString() })
    .eq('id', next.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ dropped: next.id, drop_at: dropAt.toISOString(), scheduled: !!scheduled })
}
