'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { manuallyAdjustStreak } from '@/lib/streak'
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

export async function adjustUserStreak(targetId: string, newStreak: number): Promise<void> {
  await requireAdmin()
  if (!Number.isInteger(newStreak) || newStreak < 0) throw new Error('Streak must be a non-negative whole number')
  const admin = createAdminClient()
  await manuallyAdjustStreak(admin, targetId, newStreak)
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
