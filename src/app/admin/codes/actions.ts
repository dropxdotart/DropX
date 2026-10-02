'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'
import { audit, nameOf } from '../audit'

// Redeem codes (see migration 008). Writes return results rather than
// throwing, because production hides thrown server-action messages.

export type CodeKind = 'bricks' | 'boost' | 'upgrade'

export type RedeemCode = {
  id: string
  code: string
  kind: CodeKind
  amount: number
  upgrade: string | null
  max_uses: number | null
  once_per_player: boolean
  expires_at: string | null
  active: boolean
  created_at: string
  uses: number
}

export type CodeInput = {
  code: string
  kind: CodeKind
  amount: number
  upgrade: string | null
  maxUses: number | null
  oncePerPlayer: boolean
  expiresAt: string | null
}

type Result = { ok: true } | { ok: false; message: string }

const UPGRADES = ['workers', 'fleet', 'tools', 'speed', 'yardSpeed', 'yardBonus']

export async function listCodes(): Promise<RedeemCode[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient()
    .from('redeem_codes')
    .select('*, code_redemptions(count)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(({ code_redemptions, ...c }) => ({
    ...c,
    uses: (code_redemptions as { count: number }[] | null)?.[0]?.count ?? 0,
  })) as RedeemCode[]
}

function validate(input: CodeInput): string | null {
  if (!/^[A-Z0-9_-]{3,24}$/.test(input.code)) return 'Codes are 3–24 letters, numbers, - or _'
  if (!['bricks', 'boost', 'upgrade'].includes(input.kind)) return 'Pick what it gives'
  if (!(input.amount > 0)) return 'Amount must be more than 0'
  if (input.kind === 'upgrade' && !UPGRADES.includes(input.upgrade ?? '')) return 'Pick which upgrade'
  if (input.kind === 'upgrade' && !Number.isInteger(input.amount)) return 'Upgrades are whole numbers'
  if (input.maxUses !== null && !(Number.isInteger(input.maxUses) && input.maxUses > 0)) return 'Max uses must be a whole number above 0'
  return null
}

export async function createCode(input: CodeInput): Promise<Result> {
  await requireAdminSession()
  const clean = { ...input, code: input.code.trim().toUpperCase() }
  const problem = validate(clean)
  if (problem) return { ok: false, message: problem }
  const { error } = await createAdminClient()
    .from('redeem_codes')
    .insert({
      code: clean.code,
      kind: clean.kind,
      amount: clean.amount,
      upgrade: clean.kind === 'upgrade' ? clean.upgrade : null,
      max_uses: clean.maxUses,
      once_per_player: clean.oncePerPlayer,
      expires_at: clean.expiresAt,
    })
  if (error) return { ok: false, message: error.code === '23505' ? 'That code already exists' : error.message }
  revalidatePath('/admin/codes')
  await audit('Created code', clean.code, { kind: clean.kind, amount: clean.amount, upgrade: clean.upgrade, maxUses: clean.maxUses })
  return { ok: true }
}

export async function setCodeActive(id: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const label = await nameOf('redeem_codes', id, 'code')
  const { error } = await createAdminClient().from('redeem_codes').update({ active }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  await audit(active ? 'Turned code on' : 'Turned code off', label)
  return { ok: true }
}

// Deleting a code also forgets who redeemed it.
export async function deleteCode(id: string): Promise<Result> {
  await requireAdminSession()
  const label = await nameOf('redeem_codes', id, 'code')
  const { error } = await createAdminClient().from('redeem_codes').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/codes')
  await audit('Deleted code', label)
  return { ok: true }
}
