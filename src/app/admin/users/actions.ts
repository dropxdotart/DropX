'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setStreakDayOverride, clearStreakDayOverride, recomputeStreakForUser, getStreakCalendar, todayDateString } from '@/lib/streak'
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
  await requireAdmin()

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

  revalidatePath('/admin/users')
  return { id: authUser.user.id }
}

export async function updateUserRole(targetId: string, role: UserRole): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ role }).eq('id', targetId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}

export async function updateAccountStatus(targetId: string, status: AccountStatus): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ account_status: status }).eq('id', targetId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}

export async function updateBadges(targetId: string, badges: string[]): Promise<void> {
  await requireAdmin()
  const invalid = badges.filter((b) => !AVAILABLE_BADGES.includes(b as (typeof AVAILABLE_BADGES)[number]))
  if (invalid.length) throw new Error(`Unknown badge: ${invalid.join(', ')}`)
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ badges }).eq('id', targetId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${targetId}`)
}

export async function issueStrike(targetId: string, reason: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('strikes').insert({
    user_id: targetId,
    issued_by: adminId,
    reason: reason.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${targetId}`)
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
  revalidatePath(`/admin/users/${targetId}`)
}

// Reverts a date back to trusting the real response, undoing toggleStreakDay.
export async function resetStreakDay(targetId: string, date: string): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  await clearStreakDayOverride(admin, targetId, date)
  await recomputeStreakForUser(admin, targetId)
  revalidatePath(`/admin/users/${targetId}`)
}

export async function extendStreakToToday(targetId: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  await setStreakDayOverride(admin, targetId, todayDateString(), true, adminId)
  await recomputeStreakForUser(admin, targetId)
  revalidatePath(`/admin/users/${targetId}`)
}

export async function getUserDetailData(targetId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('*').eq('id', targetId).single()
  if (!profile) throw new Error('User not found')

  const { data: strikes } = await admin
    .from('strikes')
    .select('id, reason, created_at, issued_by, issuer:profiles!issued_by(username, display_name)')
    .eq('user_id', targetId)
    .order('created_at', { ascending: false })

  const streakDays = await getStreakCalendar(admin, targetId, 120)

  return { profile: profile as Profile, strikes: strikes ?? [], streakDays }
}

export async function overrideIdentity(
  targetId: string,
  newUsername: string | null,
  newDisplayName: string | null
): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.rpc('admin_set_identity', {
    target_id: targetId,
    new_username: newUsername?.trim() || null,
    new_display_name: newDisplayName?.trim() || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/users/${targetId}`)
  revalidatePath('/admin/users')
}
