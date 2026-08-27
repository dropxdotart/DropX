'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/audit'
import type { AppConfig } from '@/lib/config'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  return user.id
}

export async function updateAppConfig(input: AppConfig): Promise<void> {
  const adminId = await requireAdmin()

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

  const admin = createAdminClient()
  const { error } = await admin
    .from('app_config')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', true)

  if (error) throw new Error(error.message)
  await logAdminAction(admin, {
    actorId: adminId,
    action: 'settings_updated',
    detail: `Drop window ${input.drop_window_start_hour}:00–${input.drop_window_end_hour}:00, photo grace ${input.photo_grace_minutes}m`,
  })
  revalidatePath('/admin/settings')
}

// Presets live in the same avatars bucket users upload their own photo to,
// under presets/ instead of {user_id}/ — the admin client bypasses the
// per-user-folder storage RLS, so this is the only way that prefix is
// ever written to.
export async function uploadAvatarPreset(formData: FormData): Promise<void> {
  const adminId = await requireAdmin()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No image provided')
  const label = (formData.get('label') as string | null)?.trim() || null

  const admin = createAdminClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `presets/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await admin.storage.from('avatars').upload(path, file, { contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(path)

  const { error } = await admin.from('avatar_presets').insert({ image_url: publicUrl, label })
  if (error) throw new Error(error.message)

  await logAdminAction(admin, {
    actorId: adminId,
    action: 'avatar_preset_added',
    detail: label ? `Added avatar preset "${label}"` : 'Added avatar preset',
  })

  revalidatePath('/admin/settings')
  revalidatePath('/profile')
}

export async function setAvatarPresetActive(id: string, active: boolean): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('avatar_presets').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/settings')
  revalidatePath('/profile')
}

export async function deleteAvatarPreset(id: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('avatar_presets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await logAdminAction(admin, { actorId: adminId, action: 'avatar_preset_removed', detail: 'Removed avatar preset' })
  revalidatePath('/admin/settings')
  revalidatePath('/profile')
}
