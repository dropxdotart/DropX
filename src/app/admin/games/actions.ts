'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

export async function updateGame(
  id: string,
  patch: { available?: boolean; is_paid?: boolean; price_cents?: number | null; active?: boolean }
): Promise<void> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { error } = await admin.from('games').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/games')
  revalidatePath('/host')
}
