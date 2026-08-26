'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppConfig } from '@/lib/config'
import { etWindowToday } from '@/lib/time'
import { findTodaysDrop } from '@/lib/drop'
import { logAdminAction } from '@/lib/audit'
import type { ChallengeType } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return { supabase, userId: user.id }
}

export type ChallengeInput = {
  type: ChallengeType
  prompt: string
  choices: string[] | null
  correct_answer: string
  explanation: string | null
  tags: string[]
  scheduled_date: string | null
}

export async function createChallenge(input: ChallengeInput): Promise<void> {
  const { supabase, userId } = await requireAdmin()

  if (!input.prompt.trim()) throw new Error('Prompt is required')
  if (input.type !== 'photo' && !input.correct_answer.trim()) {
    throw new Error('Correct answer is required for this challenge type')
  }
  if (input.type === 'multiple_choice' && (!input.choices || input.choices.filter((c) => c.trim()).length < 2)) {
    throw new Error('Multiple choice needs at least 2 non-empty choices')
  }

  const { data: created, error } = await supabase
    .from('challenges')
    .insert({
      type: input.type,
      prompt: input.prompt.trim(),
      choices: input.type === 'multiple_choice' ? input.choices?.filter((c) => c.trim()) : null,
      correct_answer: input.type === 'photo' ? 'n/a' : input.correct_answer.trim(),
      explanation: input.explanation?.trim() || null,
      tags: input.tags,
      scheduled_date: input.scheduled_date,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), {
    actorId: userId,
    action: 'challenge_created',
    detail: `Challenge created: "${input.prompt.trim()}"${created ? ` (${created.id})` : ''}`,
  })
  revalidatePath('/admin/challenges')
}

export async function updateChallenge(id: string, input: ChallengeInput): Promise<void> {
  const { supabase, userId } = await requireAdmin()

  // Used challenges (real drop_at) are locked — real responses reference
  // their content, so editing them after the fact would corrupt history.
  const { data: existing } = await supabase.from('challenges').select('drop_at').eq('id', id).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be edited')

  const { error } = await supabase
    .from('challenges')
    .update({
      type: input.type,
      prompt: input.prompt.trim(),
      choices: input.type === 'multiple_choice' ? input.choices?.filter((c) => c.trim()) : null,
      correct_answer: input.type === 'photo' ? 'n/a' : input.correct_answer.trim(),
      explanation: input.explanation?.trim() || null,
      tags: input.tags,
      scheduled_date: input.scheduled_date,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), { actorId: userId, action: 'challenge_updated', detail: `Challenge updated: "${input.prompt.trim()}"` })
  revalidatePath('/admin/challenges')
}

// Assigns (or clears, if date is null) a pool challenge's scheduled_date —
// the narrow action the calendar UI uses, separate from updateChallenge
// since a date-only change shouldn't require the full edit form's payload.
export async function setScheduledDate(challengeId: string, date: string | null): Promise<void> {
  const { supabase, userId } = await requireAdmin()

  const { data: existing } = await supabase.from('challenges').select('drop_at, prompt').eq('id', challengeId).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be scheduled')

  const { error } = await supabase.from('challenges').update({ scheduled_date: date }).eq('id', challengeId)
  if (error) {
    if (error.code === '23505') throw new Error('Another challenge is already scheduled for that date')
    throw new Error(error.message)
  }
  await logAdminAction(createAdminClient(), {
    actorId: userId,
    action: 'challenge_scheduled',
    detail: date
      ? `"${existing?.prompt ?? challengeId}" scheduled for ${date}`
      : `"${existing?.prompt ?? challengeId}" unscheduled`,
  })
  revalidatePath('/admin/challenges')
}

// Forces today's challenge (scheduled, or the oldest pool item) to drop
// immediately instead of waiting for the cron job's randomized time later
// in the window — deliberately bypasses the window check entirely, but
// keeps the same "already dropped today" guard the cron route uses, so
// this can never double-drop. The heavy confirmation lives in the UI
// (src/app/admin/challenges/ChallengeCalendar.tsx), not here — this action
// itself has no extra prompt, since by the time it's called the UI has
// already gated it.
export async function pushChallengeNow(): Promise<{ challengeId: string }> {
  const { supabase, userId } = await requireAdmin()

  const config = await getAppConfig(supabase)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const result = await findTodaysDrop(supabase, start, end)

  if (result.status === 'already_dropped') throw new Error("Today's challenge has already dropped")
  if (result.status === 'pool_empty') throw new Error('Nothing to push — no challenge is scheduled for today and the pool is empty')

  const { error } = await supabase
    .from('challenges')
    .update({ drop_at: new Date().toISOString() })
    .eq('id', result.challengeId)
  if (error) throw new Error(error.message)

  await logAdminAction(createAdminClient(), { actorId: userId, action: 'challenge_pushed', detail: 'Pushed today’s challenge live early' })

  revalidatePath('/admin/challenges')
  revalidatePath('/')
  revalidatePath('/feed')
  return { challengeId: result.challengeId }
}

export async function deleteChallenge(id: string): Promise<void> {
  const { supabase, userId } = await requireAdmin()

  const { data: existing } = await supabase.from('challenges').select('drop_at, prompt').eq('id', id).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be deleted')

  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), {
    actorId: userId,
    action: 'challenge_deleted',
    detail: existing?.prompt ? `Challenge deleted: "${existing.prompt}"` : 'Challenge deleted',
  })
  revalidatePath('/admin/challenges')
}
