'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
