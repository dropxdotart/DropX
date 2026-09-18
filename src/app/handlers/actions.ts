'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setStreakDayOverride, recomputeStreakForUser, todayDateString, addDays, toDateString } from '@/lib/streak'
import { isHandler } from '@/lib/handlers'
import { getAppConfig } from '@/lib/config'
import { etWindowToday } from '@/lib/time'
import { logAdminAction } from '@/lib/audit'

async function requireHandler() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role, badges').eq('id', user.id).single()
  if (!isHandler(profile)) throw new Error('Not authorized')
  return user.id
}

// Every bot starts with a different, believable streak (ending yesterday,
// not today) so the board doesn't look copy-pasted — today stays genuinely
// open for a handler to answer through, extending the streak for real from
// there on. Posting-as-bot itself (botSubmitAnswer/botLike) is being
// rebuilt for the new hot-take/caption/dare drop model — see /handlers.
export async function createBot(name: string): Promise<{ id: string; streak: number }> {
  const callerId = await requireHandler()
  const trimmed = name.trim()
  if (trimmed.length < 3) throw new Error('Name must be at least 3 characters')
  const username = trimmed.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (username.length < 3) throw new Error('Name needs more letters or numbers')

  const admin = createAdminClient()

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: `bot-${randomUUID()}@dropx.internal`,
    password: randomUUID(),
    email_confirm: true,
  })
  if (authError || !authUser.user) throw new Error(authError?.message ?? 'Failed to create bot account')

  const { error: profileError } = await admin
    .from('profiles')
    .update({ username, display_name: trimmed, is_bot: true })
    .eq('id', authUser.user.id)
  if (profileError) {
    if (profileError.code === '23505') throw new Error('That name is already taken')
    throw new Error(profileError.message)
  }

  // Anchor "yesterday" to today's actual drop date (if one has dropped)
  // rather than wall-clock now — those two can disagree right around the
  // ET/UTC day boundary, which would otherwise leave the seeded streak one
  // day short of connecting with a same-day real answer through "post as".
  const config = await getAppConfig(admin)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const { data: todaysDrop } = await admin
    .from('drops')
    .select('drop_at')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()
  const anchorDate = todaysDrop?.drop_at ? toDateString(todaysDrop.drop_at) : todayDateString()

  const streakLength = 5 + Math.floor(Math.random() * 18) // 5-22
  await Promise.all(
    Array.from({ length: streakLength }, (_, i) => addDays(anchorDate, -1 - i)).map((date) =>
      setStreakDayOverride(admin, authUser.user.id, date, true, callerId)
    )
  )
  const { currentStreak } = await recomputeStreakForUser(admin, authUser.user.id)

  await logAdminAction(admin, {
    actorId: callerId,
    targetUserId: authUser.user.id,
    action: 'bot_created',
    detail: `Bot created (@${username}), starting streak ${currentStreak}`,
  })

  revalidatePath('/handlers')
  return { id: authUser.user.id, streak: currentStreak }
}
