'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateStreakForAnswer, setStreakDayOverride, recomputeStreakForUser, todayDateString, addDays, toDateString } from '@/lib/streak'
import { isHandler } from '@/lib/handlers'
import { getAppConfig } from '@/lib/config'
import { etWindowToday } from '@/lib/time'

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
// there on.
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

  // Anchor "yesterday" to today's actual challenge date (if one has dropped)
  // rather than wall-clock now — those two can disagree right around the
  // ET/UTC day boundary, which would otherwise leave the seeded streak one
  // day short of connecting with a same-day real answer through "post as".
  const config = await getAppConfig(admin)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const { data: todaysChallenge } = await admin
    .from('challenges')
    .select('drop_at')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle()
  const anchorDate = todaysChallenge?.drop_at ? toDateString(todaysChallenge.drop_at) : todayDateString()

  const streakLength = 5 + Math.floor(Math.random() * 18) // 5-22
  await Promise.all(
    Array.from({ length: streakLength }, (_, i) => addDays(anchorDate, -1 - i)).map((date) =>
      setStreakDayOverride(admin, authUser.user.id, date, true, callerId)
    )
  )
  const { currentStreak } = await recomputeStreakForUser(admin, authUser.user.id)

  revalidatePath('/handlers')
  return { id: authUser.user.id, streak: currentStreak }
}

export async function botSubmitAnswer(
  botId: string,
  challengeId: string,
  answer: string
): Promise<{ isCorrect: boolean }> {
  await requireHandler()
  const admin = createAdminClient()

  const { data: challenge, error: challengeError } = await admin
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .single()
  if (challengeError || !challenge) throw new Error('Challenge not found')
  if (challenge.type === 'photo') throw new Error("Bots can't answer photo challenges yet")

  const isCorrect = answer.trim().toLowerCase() === challenge.correct_answer.trim().toLowerCase()

  const { error: insertError } = await admin
    .from('responses')
    .insert({ user_id: botId, challenge_id: challengeId, answer, is_correct: isCorrect })
  if (insertError) {
    if (insertError.code === '23505') throw new Error("This bot already answered today's challenge")
    throw new Error(insertError.message)
  }

  await updateStreakForAnswer(admin, botId, challenge.drop_at)

  revalidatePath('/handlers')
  revalidatePath('/feed')
  return { isCorrect }
}

export async function botComment(botId: string, responseId: string, body: string): Promise<void> {
  await requireHandler()
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty')
  if (trimmed.length > 500) throw new Error('Comment is too long')

  const admin = createAdminClient()
  const { error } = await admin.from('comments').insert({ user_id: botId, response_id: responseId, body: trimmed })
  if (error) throw new Error(error.message)

  revalidatePath('/feed')
  revalidatePath('/handlers')
}

export async function botLike(botId: string, responseId: string): Promise<{ liked: boolean }> {
  await requireHandler()
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('likes')
    .select('id')
    .eq('user_id', botId)
    .eq('response_id', responseId)
    .maybeSingle()

  if (existing) {
    await admin.from('likes').delete().eq('id', existing.id)
    revalidatePath('/feed')
    return { liked: false }
  }

  const { error } = await admin.from('likes').insert({ user_id: botId, response_id: responseId })
  if (error) throw new Error(error.message)
  revalidatePath('/feed')
  return { liked: true }
}
