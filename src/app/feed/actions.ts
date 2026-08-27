'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function toggleLike(responseId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to like')

  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('user_id', user.id)
    .eq('response_id', responseId)
    .maybeSingle()

  if (existing) {
    await supabase.from('likes').delete().eq('id', existing.id)
    revalidatePath('/feed')
    return { liked: false }
  }

  const { error } = await supabase.from('likes').insert({ user_id: user.id, response_id: responseId })
  if (error) throw new Error(error.message)
  revalidatePath('/feed')
  return { liked: true }
}

export async function toggleFollow(targetUserId: string): Promise<{ following: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to follow')
  if (user.id === targetUserId) throw new Error("Can't follow yourself")

  const { data: existing } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('followed_id', targetUserId)
    .maybeSingle()

  if (existing) {
    await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', targetUserId)
    revalidatePath('/feed')
    return { following: false }
  }

  const { error } = await supabase.from('follows').insert({ follower_id: user.id, followed_id: targetUserId })
  if (error) throw new Error(error.message)
  revalidatePath('/feed')
  return { following: true }
}

// target_ref snapshots the reported avatar_url — by the time a mod reviews
// this, the user may have already changed their photo, and the mod queue
// needs to know what was actually reported, not whatever's live now.
export async function reportAvatar(targetUserId: string, targetRef: string | null, reason: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to report')
  if (user.id === targetUserId) throw new Error("Can't report your own profile picture")

  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('reporter_id', user.id)
    .eq('target_user_id', targetUserId)
    .eq('target_type', 'avatar')
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) throw new Error("You've already reported this")

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_user_id: targetUserId,
    target_type: 'avatar',
    target_ref: targetRef,
    reason: reason.trim() || null,
  })
  if (error) throw new Error(error.message)
}
