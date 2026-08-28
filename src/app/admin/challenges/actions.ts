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
  prompt_image_url: string | null
  choices: string[] | null
  choices_are_images: boolean
  correct_answer: string
  graded: boolean
  explanation: string | null
  tags: string[]
  scheduled_date: string | null
  text_scale: number
  image_scale: number
}

function validateInput(input: ChallengeInput) {
  if (!input.prompt.trim()) throw new Error('Prompt is required')
  if (input.type !== 'photo' && input.graded && !input.correct_answer.trim()) {
    throw new Error('Correct answer is required for this challenge type')
  }
  if (input.type === 'multiple_choice') {
    const filled = input.choices?.filter((c) => c.trim()) ?? []
    if (filled.length < 2) throw new Error('Multiple choice needs at least 2 non-empty choices')
    if (input.graded && !filled.includes(input.correct_answer.trim())) {
      throw new Error('Pick which choice is correct')
    }
  }
}

function toRow(input: ChallengeInput, status: 'draft' | 'confirmed') {
  return {
    type: input.type,
    prompt: input.prompt.trim(),
    prompt_image_url: input.prompt_image_url,
    choices: input.type === 'multiple_choice' ? input.choices?.filter((c) => c.trim()) : null,
    choices_are_images: input.type === 'multiple_choice' ? input.choices_are_images : false,
    correct_answer: input.type === 'photo' || !input.graded ? 'n/a' : input.correct_answer.trim(),
    graded: input.type === 'photo' ? true : input.graded,
    explanation: input.explanation?.trim() || null,
    tags: input.tags,
    scheduled_date: input.scheduled_date,
    text_scale: input.text_scale,
    image_scale: input.image_scale,
    status,
  }
}

export async function createChallenge(input: ChallengeInput, status: 'draft' | 'confirmed' = 'draft'): Promise<{ id: string }> {
  const { supabase, userId } = await requireAdmin()
  validateInput(input)

  const { data: created, error } = await supabase
    .from('challenges')
    .insert(toRow(input, status))
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), {
    actorId: userId,
    action: 'challenge_created',
    detail: `Challenge created (${status}): "${input.prompt.trim()}"${created ? ` (${created.id})` : ''}`,
  })
  revalidatePath('/admin/challenges')
  return { id: created.id }
}

export async function updateChallenge(id: string, input: ChallengeInput, status: 'draft' | 'confirmed'): Promise<void> {
  const { supabase, userId } = await requireAdmin()
  validateInput(input)

  // Used challenges (real drop_at) are locked — real responses reference
  // their content, so editing them after the fact would corrupt history.
  const { data: existing } = await supabase.from('challenges').select('drop_at').eq('id', id).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be edited')

  const { error } = await supabase.from('challenges').update(toRow(input, status)).eq('id', id)

  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), { actorId: userId, action: 'challenge_updated', detail: `Challenge updated (${status}): "${input.prompt.trim()}"` })
  revalidatePath('/admin/challenges')
}

// Admin-authored images (a caption's prompt photo, image-choice tiles) live
// in the same challenge-photos bucket users' photo *answers* go to, under
// admin/ instead of {user_id}/ — the admin client bypasses that per-user
// storage RLS, same pattern as avatar presets living under avatars/presets/.
export async function uploadChallengeImage(formData: FormData): Promise<{ url: string }> {
  await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No image provided')

  const admin = createAdminClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `admin/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await admin.storage.from('challenge-photos').upload(path, file, { contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = admin.storage.from('challenge-photos').getPublicUrl(path)
  return { url: publicUrl }
}

// Assigns (or clears, if date is null) a pool challenge's scheduled_date —
// the narrow action the calendar UI uses, separate from updateChallenge
// since a date-only change shouldn't require the full edit form's payload.
export async function setScheduledDate(challengeId: string, date: string | null): Promise<void> {
  const { supabase, userId } = await requireAdmin()

  const { data: existing } = await supabase.from('challenges').select('drop_at, status, prompt').eq('id', challengeId).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be scheduled')
  // Unscheduling (date: null) is always fine, even on a challenge that
  // somehow isn't confirmed — only *assigning* a date requires it.
  if (date && existing?.status !== 'confirmed') throw new Error('Only confirmed challenges can be scheduled — confirm it first')

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
