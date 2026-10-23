import { createAdminClient } from '@/lib/supabase/admin'

// Daily ping (vercel.json cron) so Supabase's free plan never pauses the
// project for inactivity. One tiny read; the response carries no data.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { error } = await createAdminClient().from('game_settings').select('key').limit(1)
    if (error) throw error
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
