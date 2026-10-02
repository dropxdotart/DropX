'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { cleanTuning, TUNE_GROUPS, type Tuning } from '@/lib/tuning'
import { requireAdminSession } from '../auth'
import { audit } from '../audit'

export async function getTuning(): Promise<Tuning> {
  await requireAdminSession()
  const { data } = await createAdminClient().from('game_settings').select('value').eq('key', 'tuning').maybeSingle()
  return cleanTuning(data?.value)
}

// Saves the sliders; games pick them up on their next sync.
export async function saveTuning(values: Tuning): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireAdminSession()
  const before = await getTuning()
  const next = cleanTuning(values)
  const { error } = await createAdminClient()
    .from('game_settings')
    .upsert({ key: 'tuning', value: next, updated_at: new Date().toISOString() })
  if (error) return { ok: false, message: error.message }
  const changes = Object.fromEntries(
    TUNE_GROUPS.flatMap((g) => g.items)
      .filter((i) => before[i.key] !== next[i.key])
      .map((i) => [i.label, `${before[i.key]}% → ${next[i.key]}%`])
  )
  if (Object.keys(changes).length) await audit('Changed game balance', null, changes)
  return { ok: true }
}
