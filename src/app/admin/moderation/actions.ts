'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Flips a final decision (approved <-> rejected) and logs the reversal as
// its own moderation_log entry, so the log shows full history rather than
// just overwriting the original row. Deliberately does not touch the
// affected user's streak — see the plan's Context section on why that's a
// rare, manual-correction tool (adjustUserStreak) rather than something
// this tries to auto-derive.
export async function reverseModeration(responseId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  const admin = createAdminClient()
  const { data: current } = await admin.from('responses').select('moderation_status').eq('id', responseId).single()
  if (!current) throw new Error('Response not found')
  if (current.moderation_status === 'pending') throw new Error('Nothing to reverse — still pending')

  const newStatus = current.moderation_status === 'approved' ? 'rejected' : 'approved'

  const { error } = await admin
    .from('responses')
    .update({ moderation_status: newStatus, is_correct: newStatus === 'approved' })
    .eq('id', responseId)
  if (error) throw new Error(error.message)

  await admin.from('moderation_log').insert({
    response_id: responseId,
    moderator_id: user.id,
    decision: newStatus,
  })

  revalidatePath('/admin/moderation')
  revalidatePath('/feed')
}
