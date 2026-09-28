'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

export async function addBannedWord(wordInput: string): Promise<void> {
  await requireAdminSession()
  const word = wordInput.trim().toLowerCase()
  if (!word) throw new Error('Enter a word')

  const admin = createAdminClient()
  const { error } = await admin.from('banned_words').insert({ word })
  if (error) {
    if (error.code === '23505') throw new Error('Already on the list')
    throw new Error(error.message)
  }
  revalidatePath('/admin/words')
}

export async function removeBannedWord(id: string): Promise<void> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { error } = await admin.from('banned_words').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/words')
}
