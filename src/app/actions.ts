'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type SubmitResult = {
  isCorrect: boolean
  correctAnswer: string
  explanation: string | null
  currentStreak: number
}

// Streak "days" are tracked in UTC to keep the math independent of each
// player's local timezone — a challenge's drop_at date is its day.
function toDateString(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function addDays(dateString: string, days: number): string {
  const d = new Date(dateString + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const challengeDate = toDateString(challenge.drop_at)
  let currentStreak = profile?.current_streak ?? 0
  let longestStreak = profile?.longest_streak ?? 0

  if (!insertError) {
    const yesterday = addDays(challengeDate, -1)
    currentStreak = profile?.last_answered_date === yesterday ? currentStreak + 1 : 1
    longestStreak = Math.max(longestStreak, currentStreak)

    await supabase
      .from('profiles')
      .update({
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_answered_date: challengeDate,
      })
      .eq('id', user.id)
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
