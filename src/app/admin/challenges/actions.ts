'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ChallengeType } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return supabase
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
  const supabase = await requireAdmin()

  if (!input.prompt.trim()) throw new Error('Prompt is required')
  if (input.type !== 'photo' && !input.correct_answer.trim()) {
    throw new Error('Correct answer is required for this challenge type')
  }
  if (input.type === 'multiple_choice' && (!input.choices || input.choices.filter((c) => c.trim()).length < 2)) {
    throw new Error('Multiple choice needs at least 2 non-empty choices')
  }

  const { error } = await supabase.from('challenges').insert({
    type: input.type,
    prompt: input.prompt.trim(),
    choices: input.type === 'multiple_choice' ? input.choices?.filter((c) => c.trim()) : null,
    correct_answer: input.type === 'photo' ? 'n/a' : input.correct_answer.trim(),
    explanation: input.explanation?.trim() || null,
    tags: input.tags,
    scheduled_date: input.scheduled_date,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/challenges')
}

export async function updateChallenge(id: string, input: ChallengeInput): Promise<void> {
  const supabase = await requireAdmin()

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
  revalidatePath('/admin/challenges')
}

export async function deleteChallenge(id: string): Promise<void> {
  const supabase = await requireAdmin()

  const { data: existing } = await supabase.from('challenges').select('drop_at').eq('id', id).single()
  if (existing?.drop_at) throw new Error('This challenge has already been used and can no longer be deleted')

  const { error } = await supabase.from('challenges').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/challenges')
}
