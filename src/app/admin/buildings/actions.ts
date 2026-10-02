'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { bricksFromCells, decodeCells, SHAPE_LIMITS, type BuilderParams, type Shape } from '@/lib/game/shapes'
import { requireAdminSession } from '../auth'

// Admin-made buildings (migration 011). Writes return results rather than
// throwing, because production hides thrown server-action messages.

export type CustomBuilding = {
  id: string
  name: string
  emoji: string
  shape: Shape
  params: BuilderParams | null
  required_level: number
  contract_cost: number
  brick_value: number
  bonus: number
  active: boolean
  starts_at: string | null
  ends_at: string | null
  updated_at: string
}

export type BuildingInput = {
  name: string
  emoji: string
  shape: Shape
  params: BuilderParams | null
  requiredLevel: number
  contractCost: number
  brickValue: number
  bonus: number
}

type Result = { ok: true } | { ok: false; message: string }

const FIELDS = 'id, name, emoji, shape, params, required_level, contract_cost, brick_value, bonus, active, starts_at, ends_at, updated_at'

export async function listBuildings(): Promise<CustomBuilding[]> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().from('custom_buildings').select(FIELDS).order('required_level').order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as CustomBuilding[]
}

export async function loadBuilding(id: string): Promise<CustomBuilding | null> {
  await requireAdminSession()
  const { data } = await createAdminClient().from('custom_buildings').select(FIELDS).eq('id', id).maybeSingle()
  return (data as CustomBuilding | null) ?? null
}

function problem(input: BuildingInput): string | null {
  if (!input.name.trim() || input.name.trim().length > 40) return 'Give it a name (up to 40 letters)'
  if (!input.emoji.trim() || [...input.emoji.trim()].length > 4) return 'Pick one emoji'
  const [W, H, D] = input.shape.size
  if (!(W >= 1 && W <= SHAPE_LIMITS.maxW && H >= 1 && H <= SHAPE_LIMITS.maxH && D >= 1 && D <= SHAPE_LIMITS.maxD)) return 'The building is too big'
  const bricks = bricksFromCells(input.shape.size, decodeCells(input.shape.size, input.shape.data)).length
  if (bricks === 0) return 'The building has no bricks'
  if (bricks > SHAPE_LIMITS.maxBricks) return `Too many visible bricks (${bricks} of ${SHAPE_LIMITS.maxBricks}) — make it smaller`
  if (!(Number.isInteger(input.requiredLevel) && input.requiredLevel >= 1 && input.requiredLevel <= 200)) return 'Unlock level must be 1 or more'
  if (!(input.contractCost >= 0 && input.brickValue > 0 && input.bonus >= 0)) return 'Prices must be positive'
  return null
}

// Creates (no id) or updates a building. Returns its id.
export async function saveBuilding(id: string | null, input: BuildingInput): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await requireAdminSession()
  const why = problem(input)
  if (why) return { ok: false, message: why }
  const row = {
    name: input.name.trim(),
    emoji: input.emoji.trim(),
    shape: input.shape,
    params: input.params,
    required_level: input.requiredLevel,
    contract_cost: input.contractCost,
    brick_value: input.brickValue,
    bonus: input.bonus,
    updated_at: new Date().toISOString(),
  }
  const admin = createAdminClient()
  const { data, error } = id
    ? await admin.from('custom_buildings').update(row).eq('id', id).select('id').single()
    : await admin.from('custom_buildings').insert(row).select('id').single()
  if (error || !data) return { ok: false, message: error?.message ?? 'Could not save' }
  revalidatePath('/admin/buildings')
  return { ok: true, id: data.id }
}

export async function setBuildingActive(id: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('custom_buildings').update({ active }).eq('id', id)
  return error ? { ok: false, message: error.message } : { ok: true }
}

// Scheduling also switches it on (a schedule on a hidden building would
// never show).
export async function setBuildingSchedule(id: string, startsAt: string | null, endsAt: string | null): Promise<Result> {
  await requireAdminSession()
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return { ok: false, message: 'End must be after start' }
  const { error } = await createAdminClient()
    .from('custom_buildings')
    .update({ starts_at: startsAt, ends_at: endsAt, ...(startsAt || endsAt ? { active: true } : {}) })
    .eq('id', id)
  return error ? { ok: false, message: error.message } : { ok: true }
}

// Players already demolishing it keep their own copy and can finish.
export async function deleteBuilding(id: string): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('custom_buildings').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/buildings')
  return { ok: true }
}
