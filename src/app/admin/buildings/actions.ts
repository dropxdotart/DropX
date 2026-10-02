'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { bricksFromCells, cellsFromBlueprint, decodeCells, encodeCells, SHAPE_LIMITS, type BuilderParams, type Shape } from '@/lib/game/shapes'
import { BUILDINGS, suggestPricing } from '@/lib/game/buildings'
import { shapeFromMap, toMetres } from '@/lib/game/fromMap'
import { requireAdminSession } from '../auth'
import { audit, nameOf } from '../audit'

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
  await audit(id ? 'Edited building' : 'Created building', row.name, { level: row.required_level, contract: row.contract_cost, brickValue: row.brick_value, bonus: row.bonus })
  return { ok: true, id: data.id }
}

export async function setBuildingActive(id: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('custom_buildings').update({ active }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  await audit(active ? 'Turned building on' : 'Turned building off', await nameOf('custom_buildings', id, 'name'))
  return { ok: true }
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
  if (error) return { ok: false, message: error.message }
  await audit('Scheduled building', await nameOf('custom_buildings', id, 'name'), { startsAt, endsAt })
  return { ok: true }
}

// Players already demolishing it keep their own copy and can finish.
export async function deleteBuilding(id: string): Promise<Result> {
  await requireAdminSession()
  const label = await nameOf('custom_buildings', id, 'name')
  const { error } = await createAdminClient().from('custom_buildings').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/buildings')
  await audit('Deleted building', label)
  return { ok: true }
}

// Copies a building as a new, switched-off one to edit: one of yours (its
// uuid) or a built-in (its id, e.g. 'tower'). Returns the new id.
export async function duplicateBuilding(source: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await requireAdminSession()
  const admin = createAdminClient()
  let row: Record<string, unknown>
  const builtIn = BUILDINGS.find((b) => b.id === source)
  if (builtIn) {
    const { size, cells } = cellsFromBlueprint(builtIn.blueprint)
    row = {
      name: `${builtIn.name} (copy)`,
      emoji: '🏢',
      shape: { size, data: encodeCells(cells) },
      params: null,
      required_level: builtIn.requiredLevel,
      contract_cost: builtIn.contractCost,
      brick_value: builtIn.brickValue,
      bonus: builtIn.bonus,
    }
  } else {
    const { data: b } = await admin
      .from('custom_buildings')
      .select('name, emoji, shape, params, required_level, contract_cost, brick_value, bonus')
      .eq('id', source)
      .maybeSingle()
    if (!b) return { ok: false, message: 'That building is gone' }
    row = { ...b, name: `${b.name} (copy)`.slice(0, 60) }
  }
  const { data, error } = await admin
    .from('custom_buildings')
    .insert({ ...row, active: false })
    .select('id')
    .single()
  if (error || !data) return { ok: false, message: error?.message ?? 'Could not copy it' }
  await audit('Duplicated building', String(row.name))
  revalidatePath('/admin/buildings')
  return { ok: true, id: data.id }
}

// ── From an address ──────────────────────────────────────────────────────

const OSM_UA = 'RubbleAdmin/1.0 (dropdotx.vercel.app)'
type Ring = { lat: number; lon: number }[]
type OsmElement = { type: string; id: number; tags?: Record<string, string>; geometry?: Ring; members?: { role: string; geometry?: Ring }[] }

function ringOf(e: OsmElement): Ring | null {
  if (e.geometry?.length) return e.geometry
  const outer = e.members?.find((m) => m.role === 'outer' && m.geometry?.length)
  return outer?.geometry ?? null
}

// The public map servers are busy now and then: try a few, twice over.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

async function overpass(query: string): Promise<OsmElement[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': OSM_UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(20000),
        })
        if (res.ok) return ((await res.json()) as { elements: OsmElement[] }).elements ?? []
      } catch {
        // try the next server
      }
    }
  }
  throw new Error('map servers busy')
}

// Looks the address (or a place's name) up on OpenStreetMap, takes the
// building there and turns its outline + height into a new, switched-off
// building to touch up in the editor. Returns its id.
export async function buildFromAddress(address: string): Promise<{ ok: true; id: string; note: string } | { ok: false; message: string }> {
  await requireAdminSession()
  const q = address.trim().slice(0, 200)
  if (!q) return { ok: false, message: 'Type an address or a building’s name' }
  try {
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': OSM_UA },
    })
    const hits = (await geo.json()) as { lat: string; lon: string; osm_type: string; osm_id: number; category?: string; name?: string; display_name: string }[]
    const hit = hits[0]
    if (!hit) return { ok: false, message: 'Couldn’t find that address' }
    const lat = Number(hit.lat)
    const lon = Number(hit.lon)

    // The place itself if it's a building; otherwise buildings around it.
    let elements: OsmElement[] = []
    if (hit.osm_type === 'way' || hit.osm_type === 'relation') {
      elements = (await overpass(`[out:json][timeout:20];${hit.osm_type}(${hit.osm_id});out geom tags;`)).filter((e) => e.tags?.building || e.tags?.['building:part'])
    }
    if (!elements.length) {
      elements = await overpass(`[out:json][timeout:20];(way(around:40,${lat},${lon})[building];relation(around:40,${lat},${lon})[building];);out geom tags;`)
    }
    // Prefer the outline the point is inside, else the nearest one.
    let best: { e: OsmElement; ring: Ring; score: number } | null = null
    for (const e of elements) {
      const ring = ringOf(e)
      if (!ring || ring.length < 3) continue
      const pts = toMetres([{ lat, lon }, ...ring]).slice(1)
      let hit2 = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i]
        const b = pts[j]
        if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) hit2 = !hit2
      }
      const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length
      const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length
      const score = hit2 ? -1 : Math.hypot(cx, cy)
      if (!best || score < best.score) best = { e, ring, score }
    }
    if (!best) return { ok: false, message: 'Found the place, but the map has no building outline there' }

    const tags = best.e.tags ?? {}
    // Its 3D parts, if mapped: anything tagged building:part whose middle
    // sits inside this building's outline.
    const origin = best.ring[0]
    const outline = toMetres(best.ring, origin)
    const lats = best.ring.map((p) => p.lat)
    const lons = best.ring.map((p) => p.lon)
    const bbox = `${Math.min(...lats) - 0.0002},${Math.min(...lons) - 0.0002},${Math.max(...lats) + 0.0002},${Math.max(...lons) + 0.0002}`
    let parts: { outline: { x: number; y: number }[]; tags: Record<string, string> }[] = []
    try {
      const found = await overpass(`[out:json][timeout:25];(way["building:part"](${bbox});relation["building:part"](${bbox}););out geom tags;`)
      parts = found
        .map((e) => ({ ring: ringOf(e), tags: e.tags ?? {} }))
        .filter((p): p is { ring: Ring; tags: Record<string, string> } => !!p.ring && p.ring.length >= 3)
        .map((p) => ({ outline: toMetres(p.ring, origin), tags: p.tags }))
        .filter((p) => {
          const cx = p.outline.reduce((n, q) => n + q.x, 0) / p.outline.length
          const cy = p.outline.reduce((n, q) => n + q.y, 0) / p.outline.length
          let hit = false
          for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
            const a = outline[i]
            const b = outline[j]
            if (a.y > cy !== b.y > cy && cx < ((b.x - a.x) * (cy - a.y)) / (b.y - a.y) + a.x) hit = !hit
          }
          return hit
        })
    } catch {
      // no parts — the plain outline will do
    }
    const made = shapeFromMap({ outline, tags }, parts)
    if (!made) return { ok: false, message: 'That building’s outline couldn’t be turned into bricks' }
    const bricks = bricksFromCells(made.size, made.cells).length
    const level = bricks < 800 ? 3 : bricks < 2000 ? 6 : bricks < 5000 ? 10 : bricks < 10000 ? 15 : 20
    const price = suggestPricing(level, bricks)
    const name = (tags.name ?? hit.name ?? q.split(',')[0]).slice(0, 60)
    const { data, error } = await admin()
      .from('custom_buildings')
      .insert({
        name,
        emoji: '🏢',
        shape: { size: made.size, data: encodeCells(made.cells) },
        params: null,
        required_level: level,
        contract_cost: price.contractCost,
        brick_value: price.brickValue,
        bonus: price.bonus,
        active: false,
      })
      .select('id')
      .single()
    if (error || !data) return { ok: false, message: error?.message ?? 'Could not save it' }
    await audit('Built from an address', name, { address: q })
    revalidatePath('/admin/buildings')
    const known = made.parts || tags.height || tags['building:levels'] ? '' : ' The map didn’t say how tall it is, so it’s a guess.'
    const detail = made.parts ? ` Built from ${made.parts} mapped parts.` : ' The map only has its outline, so every floor is the same shape.'
    return { ok: true, id: data.id, note: `1 brick ≈ ${made.metresPerCell.toFixed(1)} m, about ${Math.round(made.heightM)} m tall.${detail}${known}` }
  } catch (err) {
    console.error('buildFromAddress failed', err)
    return { ok: false, message: 'The map service didn’t answer — try again in a minute' }
  }
}

const admin = () => createAdminClient()
