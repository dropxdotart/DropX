'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creditStreakForDrop, setStreakDayOverride, recomputeStreakForUser, todayDateString } from '@/lib/streak'
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

// Caption review: the mod's call here (rate vs remove) is what decides
// whether the response counts at all — "remove" is meant to exclude spam/
// abuse, not just record a low score — so streak crediting happens here,
// not at submission (see submitCaption).
export async function rateCaption(responseId: string, rating: number): Promise<ModerationResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) throw new Error('Rating must be 1–10')

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
    .from('caption_responses')
    .update({ moderation_status: 'approved', rating })
    .eq('id', responseId)
    .eq('moderation_status', 'pending')
    .select('id, user_id, drops(drop_at, prompt)')
    .maybeSingle()

  if (error) throw new Error(error.message)
  revalidatePath('/mod')
  if (!updated) return { alreadyHandled: true }

  await admin.from('moderation_log').insert({ target_type: 'caption_response', target_id: updated.id, moderator_id: user.id, decision: 'approved' })
  const drop = updated.drops as unknown as { drop_at: string | null; prompt: string } | null
  await logAdminAction(admin, {
    actorId: user.id,
    targetUserId: updated.user_id,
    action: 'caption_rated',
    detail: drop?.prompt ? `Rated ${rating}/10: "${drop.prompt}"` : `Rated ${rating}/10`,
  })

  if (drop?.drop_at) await creditStreakForDrop(admin, updated.user_id, drop.drop_at)

  revalidatePath('/feed')
  return { alreadyHandled: false }
}

export async function removeCaption(responseId: string): Promise<ModerationResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') throw new Error('Not authorized')

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('caption_responses')
    .update({ moderation_status: 'rejected' })
    .eq('id', responseId)
    .eq('moderation_status', 'pending')
    .select('id, user_id, drops(prompt)')
    .maybeSingle()

  if (error) throw new Error(error.message)
  revalidatePath('/mod')
  if (!updated) return { alreadyHandled: true }

  await admin.from('moderation_log').insert({ target_type: 'caption_response', target_id: updated.id, moderator_id: user.id, decision: 'rejected' })
  const drop = updated.drops as unknown as { prompt: string } | null
  await logAdminAction(admin, {
    actorId: user.id,
    targetUserId: updated.user_id,
    action: 'caption_removed',
    detail: drop?.prompt ? `Removed caption on "${drop.prompt}"` : 'Removed caption',
  })

  return { alreadyHandled: false }
}

// Dare review: approve/reject a video submission — same race-safe pattern,
// and the same "streak waits for the mod's call" reasoning as captions
// (a faked or wrong-exercise video shouldn't count).
async function moderateDare(submissionId: string, approve: boolean): Promise<ModerationResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') throw new Error('Not authorized')

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('dare_submissions')
    .update({ moderation_status: approve ? 'approved' : 'rejected' })
    .eq('id', submissionId)
    .eq('moderation_status', 'pending')
    .select('id, user_id, drops(drop_at, prompt)')
    .maybeSingle()

  if (error) throw new Error(error.message)
  revalidatePath('/mod')
  if (!updated) return { alreadyHandled: true }

  await admin.from('moderation_log').insert({ target_type: 'dare_submission', target_id: updated.id, moderator_id: user.id, decision: approve ? 'approved' : 'rejected' })
  const drop = updated.drops as unknown as { drop_at: string | null; prompt: string } | null
  await logAdminAction(admin, {
    actorId: user.id,
    targetUserId: updated.user_id,
    action: approve ? 'dare_approved' : 'dare_rejected',
    detail: drop?.prompt ? `Dare: "${drop.prompt}"` : null,
  })

  if (approve && drop?.drop_at) await creditStreakForDrop(admin, updated.user_id, drop.drop_at)

  revalidatePath('/feed')
  revalidatePath('/')
  return { alreadyHandled: false }
}

export async function approveDare(submissionId: string): Promise<ModerationResult> {
  return moderateDare(submissionId, true)
}

export async function rejectDare(submissionId: string): Promise<ModerationResult> {
  return moderateDare(submissionId, false)
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
