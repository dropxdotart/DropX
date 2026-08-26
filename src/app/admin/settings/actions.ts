'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/audit'
import type { AppConfig } from '@/lib/config'

export async function updateAppConfig(input: AppConfig): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  if (input.drop_window_start_hour < 0 || input.drop_window_start_hour > 23) {
    throw new Error('Start hour must be between 0 and 23')
  }
  if (input.drop_window_end_hour < 0 || input.drop_window_end_hour > 23) {
    throw new Error('End hour must be between 0 and 23')
  }
  if (input.drop_window_end_hour <= input.drop_window_start_hour) {
    throw new Error('End hour must be after start hour')
  }
  if (input.photo_grace_minutes < 1) {
    throw new Error('Photo grace period must be at least 1 minute')
  }

  const { error } = await supabase
    .from('app_config')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) throw new Error(error.message)
  await logAdminAction(createAdminClient(), {
    actorId: user.id,
    action: 'settings_updated',
    detail: `Drop window ${input.drop_window_start_hour}:00–${input.drop_window_end_hour}:00, photo grace ${input.photo_grace_minutes}m`,
  })
  revalidatePath('/admin/settings')
}
