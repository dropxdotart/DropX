'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/audit'

export async function setShowEveryoneTab(show: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { error } = await supabase
    .from('profiles')
    .update({ show_everyone_tab: show })
    .eq('id', user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/feed')
  revalidatePath('/profile')
}

export async function setShareToEveryone(share: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { error } = await supabase
    .from('profiles')
    .update({ share_to_everyone: share })
    .eq('id', user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/feed')
  revalidatePath('/profile')
}

// The 48-hour cooldown is enforced by a DB trigger (holds even against a
// direct table update), not just here — this just gives the client-facing
// error a friendlier wording than the raw Postgres exception message.
export async function setDisplayName(displayName: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const trimmed = displayName.trim()
  if (!trimmed) throw new Error('Display name cannot be empty')
  if (trimmed.length > 30) throw new Error('Display name must be 30 characters or fewer')

  const { data: current } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', user.id)

  if (error) {
    if (error.message.includes('48 hours')) {
      throw new Error('You can only change your display name once every 48 hours')
    }
    throw new Error(error.message)
  }

  await logAdminAction(createAdminClient(), {
    actorId: user.id,
    targetUserId: user.id,
    action: 'display_name_changed',
    detail: `Display name changed from "${current?.display_name ?? '—'}" to "${trimmed}"`,
  })

  revalidatePath('/feed')
  revalidatePath('/profile')
}

export async function updateAvatarUrl(avatarUrl: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
  if (error) throw new Error(error.message)

  await logAdminAction(createAdminClient(), {
    actorId: user.id,
    targetUserId: user.id,
    action: 'avatar_changed',
    detail: 'Profile picture updated',
  })

  revalidatePath('/feed')
  revalidatePath('/profile')
}

export async function removeAvatar(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) throw new Error(error.message)

  await logAdminAction(createAdminClient(), {
    actorId: user.id,
    targetUserId: user.id,
    action: 'avatar_changed',
    detail: 'Profile picture removed',
  })

  revalidatePath('/feed')
  revalidatePath('/profile')
}
