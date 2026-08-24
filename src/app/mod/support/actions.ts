'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { manuallyAdjustStreak } from '@/lib/streak'

// Deliberately narrow: mods (and admins) can fix a streak for a support
// case, nothing else — no role changes, bans, or identity overrides. Those
// stay admin-only in /admin/users.
export async function adjustStreakAsSupport(targetId: string, newStreak: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'mod' && profile?.role !== 'admin') throw new Error('Not authorized')

  if (!Number.isInteger(newStreak) || newStreak < 0) throw new Error('Streak must be a non-negative whole number')

  const admin = createAdminClient()
  await manuallyAdjustStreak(admin, targetId, newStreak)
  revalidatePath('/mod/support')
}
