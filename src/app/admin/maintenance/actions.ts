'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminSession } from '../auth'

export async function setMaintenance(on: boolean): Promise<{ ok: boolean }> {
  if (!(await isAdminSession())) return { ok: false }
  const { error } = await createAdminClient()
    .from('game_settings')
    .upsert({ key: 'maintenance', value: { on } }, { onConflict: 'key' })
  revalidatePath('/')
  revalidatePath('/admin/maintenance')
  return { ok: !error }
}
