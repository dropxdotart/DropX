'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/audit'

// Flips a final decision (approved <-> rejected) and logs the reversal as
// its own moderation_log entry, so the log shows full history rather than
// just overwriting the original row. Deliberately does not touch the
// affected user's streak — that's a rare, manual-correction tool
// (adjustUserStreak in /admin/users) rather than something this tries to
// auto-derive.
export async function reverseModeration(targetType: 'caption_response' | 'dare_submission', targetId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  const admin = createAdminClient()
  const table = targetType === 'caption_response' ? 'caption_responses' : 'dare_submissions'
  const { data: current } = await admin.from(table).select('moderation_status, user_id, drops(prompt)').eq('id', targetId).single()
  if (!current) throw new Error('Not found')
  if (current.moderation_status === 'pending') throw new Error('Nothing to reverse — still pending')

  const newStatus = current.moderation_status === 'approved' ? 'rejected' : 'approved'

  const { error } = await admin.from(table).update({ moderation_status: newStatus }).eq('id', targetId)
  if (error) throw new Error(error.message)

  await admin.from('moderation_log').insert({
    target_type: targetType,
    target_id: targetId,
    moderator_id: user.id,
    decision: newStatus,
  })

  const prompt = (current.drops as unknown as { prompt: string } | null)?.prompt
  await logAdminAction(admin, {
    actorId: user.id,
    targetUserId: current.user_id,
    action: 'moderation_reversed',
    detail: `Decision reversed to ${newStatus}${prompt ? ` on "${prompt}"` : ''}`,
  })

  revalidatePath('/admin/moderation')
  revalidatePath('/feed')
}
