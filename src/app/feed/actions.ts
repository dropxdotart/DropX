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
