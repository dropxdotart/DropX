'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateStreakForAnswer } from '@/lib/streak'

type SubmitResult = {
  isCorrect: boolean
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

  const isCorrect = answer.trim().toLowerCase() === challenge.correct_answer.trim().toLowerCase()

  const { error: insertError } = await supabase
    .from('responses')
    .insert({ user_id: user.id, challenge_id: challengeId, answer, is_correct: isCorrect })

  if (insertError && insertError.code !== '23505') {
    throw new Error(insertError.message)
  }

  let currentStreak = 0
  if (!insertError) {
    ;({ currentStreak } = await updateStreakForAnswer(supabase, user.id, challenge.drop_at))
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak')
      .eq('id', user.id)
      .single()
    currentStreak = profile?.current_streak ?? 0
  }

  revalidatePath('/')
  revalidatePath('/profile')

  return {
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
