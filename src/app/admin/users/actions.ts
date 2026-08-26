'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setStreakDayOverride, clearStreakDayOverride, recomputeStreakForUser, getStreakCalendar, todayDateString } from '@/lib/streak'
import { logAdminAction } from '@/lib/audit'
import { AVAILABLE_BADGES } from '@/lib/badges'
import type { UserRole, AccountStatus, Profile } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user.id
}

// Creates a real, real-login-capable account directly from the admin panel
// — the admin sets the password themselves and shares it out of band (no
// invite-email flow exists yet, since SMTP isn't set up — see task #11).
// Distinct from Handlers' createBot: this needs a real email + a password
// the actual person can use, not throwaway values nobody will ever type.
export async function createRealUser(username: string, email: string, password: string): Promise<{ id: string }> {
  const adminId = await requireAdmin()

  const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (trimmedUsername.length < 3) throw new Error('Username needs at least 3 letters/numbers')
  const trimmedEmail = email.trim()
  if (!trimmedEmail.includes('@')) throw new Error('A valid email is required')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')

  const admin = createAdminClient()
  const { data: authUser, error } = await admin.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: { username: trimmedUsername },
  })
  if (error || !authUser.user) {
    if (error?.message.includes('already been registered')) throw new Error('That email is already in use')
    if (error?.message.includes('duplicate key') && error.message.includes('username')) {
      throw new Error('That username is already taken')
    }
    throw new Error(error?.message ?? 'Failed to create account')
  }

  await logAdminAction(admin, {
    actorId: adminId,
    targetUserId: authUser.user.id,
    action: 'user_created',
    detail: `Account created (@${trimmedUsername})`,
  })

  revalidatePath('/admin/users')
  return { id: authUser.user.id }
}

export async function updateUserRole(targetId: string, role: UserRole, previousRole: UserRole): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', targetId)
  if (error) throw new Error(error.message)
  if (role !== previousRole) {
    await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'role_changed', detail: `Role changed from ${previousRole} to ${role}` })
  }
  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}

export async function updateAccountStatus(targetId: string, status: AccountStatus, previousStatus: AccountStatus): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ account_status: status }).eq('id', targetId)
  if (error) throw new Error(error.message)
  if (status !== previousStatus) {
    await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'status_changed', detail: `Status changed from ${previousStatus} to ${status}` })
  }
  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}

export async function updateBadges(targetId: string, badges: string[], previousBadges: string[]): Promise<void> {
  const adminId = await requireAdmin()
  const invalid = badges.filter((b) => !AVAILABLE_BADGES.includes(b as (typeof AVAILABLE_BADGES)[number]))
  if (invalid.length) throw new Error(`Unknown badge: ${invalid.join(', ')}`)
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ badges }).eq('id', targetId)
  if (error) throw new Error(error.message)

  const added = badges.filter((b) => !previousBadges.includes(b))
  const removed = previousBadges.filter((b) => !badges.includes(b))
  if (added.length || removed.length) {
    const parts = [added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`].filter(Boolean)
    await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'badges_updated', detail: `Badges ${parts.join(' · ')}` })
  }
  revalidatePath(`/admin/users/${targetId}`)
}

export async function issueStrike(targetId: string, reason: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const trimmedReason = reason.trim() || null
  const { error } = await admin.from('strikes').insert({
    user_id: targetId,
    issued_by: adminId,
    reason: trimmedReason,
  })
  if (error) throw new Error(error.message)
  await logAdminAction(admin, {
    actorId: adminId,
    targetUserId: targetId,
    action: 'strike_issued',
    detail: trimmedReason ? `Strike issued: "${trimmedReason}"` : 'Strike issued',
  })
  revalidatePath(`/admin/users/${targetId}`)
}

// Soft-revokes a strike (row stays, revoked_at/revoked_by get set) instead
// of deleting it — the fact a strike was issued and later reversed is itself
// something an admin reviewing this account should be able to see.
export async function revokeStrike(strikeId: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()

  const { data: strike } = await admin.from('strikes').select('user_id, reason, revoked_at').eq('id', strikeId).single()
  if (!strike) throw new Error('Strike not found')
  if (strike.revoked_at) throw new Error('That strike was already revoked')

  const { error } = await admin
    .from('strikes')
    .update({ revoked_at: new Date().toISOString(), revoked_by: adminId })
    .eq('id', strikeId)
  if (error) throw new Error(error.message)

  await logAdminAction(admin, {
    actorId: adminId,
    targetUserId: strike.user_id,
    action: 'strike_revoked',
    detail: strike.reason ? `Strike revoked: "${strike.reason}"` : 'Strike revoked',
  })

  revalidatePath(`/admin/users/${strike.user_id}`)
}

// The actual correction lever: force a specific date to count (or not)
// toward the streak, then recompute current_streak/longest_streak from the
// full, now-corrected history. Admin-only — this rewrites what happened on a
// specific day, a heavier power than the mod support tool's "extend to
// today" nudge.
export async function toggleStreakDay(targetId: string, date: string, counts: boolean): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  await setStreakDayOverride(admin, targetId, date, counts, adminId)
  await recomputeStreakForUser(admin, targetId)
  await logAdminAction(admin, {
    actorId: adminId,
    targetUserId: targetId,
    action: 'streak_day_overridden',
    detail: `Streak day ${date} set to ${counts ? 'counted' : 'not counted'}`,
  })
  revalidatePath(`/admin/users/${targetId}`)
}

// Reverts a date back to trusting the real response, undoing toggleStreakDay.
export async function resetStreakDay(targetId: string, date: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  await clearStreakDayOverride(admin, targetId, date)
  await recomputeStreakForUser(admin, targetId)
  await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'streak_day_reset', detail: `Streak day ${date} reset to actual` })
  revalidatePath(`/admin/users/${targetId}`)
}

export async function extendStreakToToday(targetId: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  await setStreakDayOverride(admin, targetId, todayDateString(), true, adminId)
  await recomputeStreakForUser(admin, targetId)
  await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'streak_extended', detail: 'Streak extended to include today' })
  revalidatePath(`/admin/users/${targetId}`)
}

export async function getUserDetailData(targetId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('*').eq('id', targetId).single()
  if (!profile) throw new Error('User not found')

  const { data: strikes } = await admin
    .from('strikes')
    .select(
      'id, reason, created_at, issued_by, issuer:profiles!issued_by(username, display_name), revoked_at, revoked_by, revoker:profiles!revoked_by(username, display_name)'
    )
    .eq('user_id', targetId)
    .order('created_at', { ascending: false })

  const { data: actions } = await admin
    .from('admin_actions')
    .select('id, action, detail, created_at, actor_id, actor:profiles!actor_id(username, display_name)')
    .eq('target_user_id', targetId)
    .order('created_at', { ascending: false })
    .limit(50)

  const streakDays = await getStreakCalendar(admin, targetId, 120)

  return { profile: profile as Profile, strikes: strikes ?? [], streakDays, actions: actions ?? [] }
}

export async function overrideIdentity(
  targetId: string,
  newUsername: string | null,
  newDisplayName: string | null,
  previousUsername: string | null,
  previousDisplayName: string | null
): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const trimmedUsername = newUsername?.trim() || null
  const trimmedDisplayName = newDisplayName?.trim() || null
  const { error } = await admin.rpc('admin_set_identity', {
    target_id: targetId,
    new_username: trimmedUsername,
    new_display_name: trimmedDisplayName,
  })
  if (error) throw new Error(error.message)

  const parts = [
    trimmedUsername !== previousUsername && `username @${previousUsername ?? '—'} → @${trimmedUsername ?? '—'}`,
    trimmedDisplayName !== previousDisplayName && `name "${previousDisplayName ?? '—'}" → "${trimmedDisplayName ?? '—'}"`,
  ].filter(Boolean)
  if (parts.length) {
    await logAdminAction(admin, { actorId: adminId, targetUserId: targetId, action: 'identity_overridden', detail: `Identity changed: ${parts.join(', ')}` })
  }

  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}
