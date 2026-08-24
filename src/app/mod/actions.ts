'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateStreakForAnswer } from '@/lib/streak'

type ModerationResult = { alreadyHandled: boolean }

// Authorization happens on the user-scoped client (real session, real RLS —
// this is the actual security boundary: only a mod/admin's own responses
// row-visibility policy lets this query find the pending item at all). Once
// authorized, the mutation itself runs on the admin client: crediting
// someone else's streak means writing to a profile the acting mod doesn't
// own, which is exactly the kind of privileged, narrowly-scoped system side
// effect service-role access is for — better than a broad "mods can edit any
// profile" RLS policy that would outlive this one use case.
async function moderatePhoto(responseId: string, approve: boolean): Promise<ModerationResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') throw new Error('Not authorized')

  const admin = createAdminClient()

  // The `.eq('moderation_status', 'pending')` filter here is what makes this
  // race-safe when two mods act on the same item at once: Postgres's
  // row-level locking means only the first request's UPDATE actually matches
  // a row — the second's WHERE clause (re-evaluated against the
  // now-committed 'approved'/'rejected' status) matches nothing, and we
  // report that back as `alreadyHandled` rather than silently
  // double-processing.
  const { data: updated, error } = await admin
    .from('responses')
    .update({ moderation_status: approve ? 'approved' : 'rejected', is_correct: approve })
    .eq('id', responseId)
    .eq('moderation_status', 'pending')
    .select('id, user_id, challenges(drop_at)')
    .maybeSingle()

  if (error) throw new Error(error.message)

  revalidatePath('/mod')

  if (!updated) {
    return { alreadyHandled: true }
  }

  await admin.from('moderation_log').insert({
    response_id: updated.id,
    moderator_id: user.id,
    decision: approve ? 'approved' : 'rejected',
  })

  if (approve) {
    const dropAt = (updated.challenges as unknown as { drop_at: string } | null)?.drop_at
    if (dropAt) await updateStreakForAnswer(admin, updated.user_id, dropAt)
  }

  revalidatePath('/feed')
  revalidatePath('/')
  return { alreadyHandled: false }
}

export async function approvePhoto(responseId: string): Promise<ModerationResult> {
  return moderatePhoto(responseId, true)
}

export async function rejectPhoto(responseId: string): Promise<ModerationResult> {
  return moderatePhoto(responseId, false)
}
