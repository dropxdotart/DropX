'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { setStreakDayOverride, clearStreakDayOverride, recomputeStreakForUser, todayDateString } from '@/lib/streak'
import { AVAILABLE_BADGES } from '@/lib/badges'
import type { UserRole, AccountStatus } from '@/lib/types'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user.id
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
