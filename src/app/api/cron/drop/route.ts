import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { etWindowToday } from '@/lib/time'

// Fired once daily by Vercel Cron (see vercel.json), safely after the window
// opens. Picks the oldest un-dropped challenge from the pool and gives it a
// random drop_at somewhere inside today's 12PM–7PM ET window, so the exact
// moment stays unknown to players until it happens (see challenges RLS).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { start, end, now } = etWindowToday(12, 19)
  if (now < start || now > end) {
    return NextResponse.json({ skipped: 'outside drop window' })
  }

  const supabase = createAdminClient()

  const { data: alreadyDropped } = await supabase
    .from('challenges')
    .select('id')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()

  if (alreadyDropped) {
    return NextResponse.json({ skipped: 'already dropped today' })
  }

  const { data: next } = await supabase
    .from('challenges')
    .select('id')
    .is('drop_at', null)
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

  return NextResponse.json({ dropped: next.id, drop_at: dropAt.toISOString() })
}
