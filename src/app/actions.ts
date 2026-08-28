'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateStreakForAnswer } from '@/lib/streak'
import { logAdminAction } from '@/lib/audit'
import type { ChallengeType } from '@/lib/types'

type SubmitResult = {
  id: string
  // null = not graded yet — a non-exact text answer went to the Text
  // review queue instead of failing outright (see mod/actions.ts's
  // reviewTextAnswer). Streak already credited either way; see below.
  isCorrect: boolean | null
  correctAnswer: string
  explanation: string | null
  currentStreak: number
}

export async function submitAnswer(challengeId: string, answer: string): Promise<SubmitResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to answer')

  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .single()
  if (challengeError || !challenge) throw new Error('Challenge not found')

  const isExactMatch = answer.trim().toLowerCase() === challenge.correct_answer.trim().toLowerCase()
  // Multiple-choice is graded against a fixed, admin-authored set of
  // choices — no typo risk, always instant. Free text can near-miss on a
  // typo or phrasing, so a non-exact answer goes to a mod instead of
  // failing outright (moderation_status mirrors the photo-review pattern;
  // is_correct stays null until a mod swipes it in the Text review queue).
  const needsReview = challenge.type === 'text' && !isExactMatch
  const isCorrect: boolean | null = needsReview ? null : isExactMatch

  const { data: inserted, error: insertError } = await supabase
    .from('responses')
    .insert({
      user_id: user.id,
      challenge_id: challengeId,
      answer,
      is_correct: isCorrect,
      moderation_status: needsReview ? 'pending' : 'approved',
    })
    .select('id')
    .single()

  let responseId: string
  let currentStreak = 0

  if (insertError) {
    if (insertError.code !== '23505') throw new Error(insertError.message)
    const { data: existing } = await supabase
      .from('responses')
      .select('id')
      .eq('user_id', user.id)
      .eq('challenge_id', challengeId)
      .single()
    if (!existing) throw new Error(insertError.message)
    responseId = existing.id
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak')
      .eq('id', user.id)
      .single()
    currentStreak = profile?.current_streak ?? 0
  } else {
    responseId = inserted.id
    ;({ currentStreak } = await updateStreakForAnswer(supabase, user.id, challenge.drop_at))
  }

  revalidatePath('/')
  revalidatePath('/profile')

  return {
    id: responseId,
    isCorrect,
    correctAnswer: challenge.correct_answer,
    explanation: challenge.explanation,
    currentStreak,
  }
}

// Photo challenges can't be auto-graded — the response inserts as 'pending'
// and is_correct stays null until a mod approves/rejects it in /mod
// (see submitPhotoAnswer's sibling, approvePhoto/rejectPhoto in
// src/app/mod/actions.ts). No streak update happens here; that only
// happens once a mod approves.
export async function submitPhotoAnswer(challengeId: string, photoUrl: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to answer')

  const { error: insertError } = await supabase.from('responses').insert({
    user_id: user.id,
    challenge_id: challengeId,
    answer: photoUrl,
    photo_url: photoUrl,
    is_correct: null,
    moderation_status: 'pending',
  })

  if (insertError && insertError.code !== '23505') {
    throw new Error(insertError.message)
  }

  revalidatePath('/')
}

// Ungraded (graded=false) text challenges — captions, "no correct answer"
// prompts. There's no right/wrong to check, so every response goes
// straight to the Caption review queue where a mod either rates it 1-10
// (see rateCaption) or removes it (see removeCaption) — unlike a
// wrong-but-gradable text answer, streak crediting waits for that
// decision, since "remove" is meant to genuinely exclude spam/abuse from
// counting, not just correct a right/wrong call.
export async function submitCaptionAnswer(challengeId: string, answer: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to answer')
  if (!answer.trim()) throw new Error('Answer cannot be empty')

  const { error: insertError } = await supabase.from('responses').insert({
    user_id: user.id,
    challenge_id: challengeId,
    answer: answer.trim(),
    is_correct: null,
    moderation_status: 'pending',
  })

  if (insertError && insertError.code !== '23505') {
    throw new Error(insertError.message)
  }

  revalidatePath('/')
}

// Retracts a user's own answer — the row stays (unique(user_id, challenge_id)
// still blocks re-answering that same challenge), just hidden from everyone
// but the owner, and logged for admins (src/app/admin/audit). There's no
// RLS UPDATE policy letting a user touch their own response (deliberately —
// answers are meant to be final), so this authorizes on the real session
// and writes through the admin client, same pattern as every other
// privileged mutation in this app.
export async function deleteMyResponse(responseId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('responses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', responseId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!updated) throw new Error('Nothing to delete')

  await admin.from('response_deletions').insert({ response_id: responseId, user_id: user.id })
  await logAdminAction(admin, { actorId: user.id, targetUserId: user.id, action: 'answer_deleted', detail: 'Deleted their own answer' })

  revalidatePath('/')
  revalidatePath('/feed')
  revalidatePath('/profile')
}

// Free-text idea + a rough type — no correct answer/choices from the
// submitter, so there's nothing here for a user to fake or grief with.
// Admins see these as a read-only "Coming soon" list on /admin/challenges;
// turning one into a real challenge is a manual step via the New Challenge
// form, not automated.
export async function submitChallengeIdea(type: ChallengeType, idea: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const trimmed = idea.trim()
  if (!trimmed) throw new Error('Idea cannot be empty')
  if (trimmed.length > 300) throw new Error('Keep it under 300 characters')

  const { error } = await supabase.from('challenge_ideas').insert({ submitted_by: user.id, type, idea: trimmed })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/challenges')
}
