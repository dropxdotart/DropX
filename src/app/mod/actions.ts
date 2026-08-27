'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateStreakForAnswer, setStreakDayOverride, recomputeStreakForUser, todayDateString } from '@/lib/streak'
import { logAdminAction } from '@/lib/audit'

type ModerationResult = { alreadyHandled: boolean }

async function requireMod() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') throw new Error('Not authorized')
  return user.id
}

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
    .select('id, user_id, challenges(drop_at, prompt)')
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

  const challenge = updated.challenges as unknown as { drop_at: string; prompt: string } | null
  await logAdminAction(admin, {
    actorId: user.id,
    targetUserId: updated.user_id,
    action: approve ? 'photo_approved' : 'photo_rejected',
    detail: challenge?.prompt ? `Photo answer to "${challenge.prompt}"` : null,
  })

  if (approve) {
    const dropAt = challenge?.drop_at
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

// The narrow support-tool power: nudge a streak to include today, no
// per-day rewriting. Full day-by-day correction stays admin-only, in
// /admin/users — see toggleStreakDay there.
export async function extendStreakToTodayAsMod(targetId: string): Promise<void> {
  const modId = await requireMod()
  const admin = createAdminClient()
  await setStreakDayOverride(admin, targetId, todayDateString(), true, modId)
  await recomputeStreakForUser(admin, targetId)
  await logAdminAction(admin, { actorId: modId, targetUserId: targetId, action: 'streak_extended', detail: 'Streak extended to include today (mod support)' })
  revalidatePath('/mod')
}

export async function dismissReport(reportId: string): Promise<void> {
  const modId = await requireMod()
  const admin = createAdminClient()
  const { error } = await admin
    .from('reports')
    .update({ status: 'dismissed', resolved_by: modId, resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidatePath('/mod')
}

// Only clears the avatar if it still matches what was actually reported
// (target_ref) — the user may have already changed their photo since the
// report was filed, and clearing an unrelated newer one would be wrong.
export async function removeReportedAvatar(reportId: string): Promise<void> {
  const modId = await requireMod()
  const admin = createAdminClient()

  const { data: report } = await admin.from('reports').select('target_user_id, target_ref').eq('id', reportId).single()
  if (!report) throw new Error('Report not found')

  const { data: profile } = await admin.from('profiles').select('avatar_url').eq('id', report.target_user_id).single()
  if (profile?.avatar_url && profile.avatar_url === report.target_ref) {
    await admin.from('profiles').update({ avatar_url: null }).eq('id', report.target_user_id)
    await logAdminAction(admin, {
      actorId: modId,
      targetUserId: report.target_user_id,
      action: 'avatar_changed',
      detail: 'Profile picture removed (reported)',
    })
  }

  const { error } = await admin
    .from('reports')
    .update({ status: 'resolved', resolved_by: modId, resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidatePath('/mod')
  revalidatePath('/feed')
}

// A mod's strike power is scoped to acting on a report they're handling —
// not a general "strike anyone" tool. General strike issuance from a plain
// username lookup stays admin-only, in /admin/users.
export async function issueStrikeForReport(reportId: string, reason: string): Promise<void> {
  const modId = await requireMod()
  const admin = createAdminClient()

  const { data: report } = await admin.from('reports').select('target_user_id').eq('id', reportId).single()
  if (!report) throw new Error('Report not found')

  const trimmedReason = reason.trim() || null
  const { error: strikeError } = await admin
    .from('strikes')
    .insert({ user_id: report.target_user_id, issued_by: modId, reason: trimmedReason })
  if (strikeError) throw new Error(strikeError.message)

  await logAdminAction(admin, {
    actorId: modId,
    targetUserId: report.target_user_id,
    action: 'strike_issued',
    detail: trimmedReason ? `Strike issued: "${trimmedReason}" (reported profile picture)` : 'Strike issued (reported profile picture)',
  })

  const { error } = await admin
    .from('reports')
    .update({ status: 'resolved', resolved_by: modId, resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw new Error(error.message)
  revalidatePath('/mod')
}
