'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ISLANDS } from '@/lib/game/islands'
import { requireAdminSession } from '../auth'
import { audit } from '../audit'
import { buildReport } from './report'
import { PLACEMENTS, type AdPlacement, type Campaign, type CampaignInput, type Creative, type Report } from './shared'

// The ads admin: campaigns (where, when, to whom, how often) each holding
// creatives, plus reports. Writes return results rather than throwing,
// because production hides thrown server-action messages.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLACEMENT_VALUES = PLACEMENTS.map((p) => p.value)
const ISLAND_IDS = ISLANDS.map((s) => s.id as string)

const fail = (message: string) => ({ ok: false as const, message })

function revalidate(id?: string) {
  revalidatePath('/admin/ads')
  if (id) revalidatePath(`/admin/ads/${id}`)
}

// Positive whole number or nothing.
function count(n: number | null, max = 1e9) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  const v = Math.round(n)
  return v > 0 ? Math.min(v, max) : null
}

function clean(input: CampaignInput): { ok: true; row: Record<string, unknown> } | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 80)
  if (!name) return fail('Give the campaign a name')
  if (!['active', 'paused'].includes(input.status)) return fail('Invalid status')
  if (input.placements.some((p) => !PLACEMENT_VALUES.includes(p))) return fail('Invalid placement')
  const url = input.cta_url?.trim() || null
  if (url && !/^https?:\/\//i.test(url)) return fail('The link must start with http:// or https://')
  if (input.starts_at && input.ends_at && new Date(input.ends_at) <= new Date(input.starts_at)) return fail('The end date must be after the start')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.tz })
  } catch {
    return fail('Unknown time zone')
  }
  const days = input.days?.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) ?? null
  const hourFrom = input.hour_from === null ? null : Math.max(0, Math.min(23, Math.round(input.hour_from)))
  const hourTo = input.hour_to === null ? null : Math.max(1, Math.min(24, Math.round(input.hour_to)))
  if (hourFrom !== null && hourTo !== null && hourFrom === hourTo) return fail('The hours window is empty')
  const minLevel = count(input.min_level, 999)
  const maxLevel = count(input.max_level, 999)
  if (minLevel && maxLevel && maxLevel < minLevel) return fail('Max level must be at least the min level')
  const islands = input.islands?.filter((i) => ISLAND_IDS.includes(i)) ?? null
  if (!['all', 'new', 'returning'].includes(input.audience)) return fail('Invalid audience')
  return {
    ok: true,
    row: {
      name,
      advertiser: input.advertiser.trim().slice(0, 60),
      status: input.status,
      placements: [...new Set(input.placements)],
      headline: input.headline.trim().slice(0, 90),
      cta_text: input.cta_text.trim().slice(0, 24) || 'Learn more',
      cta_url: url,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      days: days && days.length && days.length < 7 ? [...new Set(days)].sort() : null,
      hour_from: hourFrom,
      hour_to: hourTo,
      tz: input.tz,
      freq_cap: count(input.freq_cap, 1000),
      daily_cap: count(input.daily_cap),
      total_cap: count(input.total_cap),
      min_level: minLevel,
      max_level: maxLevel,
      islands: islands && islands.length ? islands : null,
      audience: input.audience,
      weight: Math.max(1, Math.min(10, Math.round(input.weight) || 1)),
      notes: input.notes.slice(0, 2000),
      updated_at: new Date().toISOString(),
    },
  }
}

// ── Campaigns ──────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<{ campaigns: Campaign[]; creatives: Creative[] }> {
  await requireAdminSession()
  const admin = createAdminClient()
  const [c, cr] = await Promise.all([
    admin.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
    admin.from('ad_creatives').select('*').order('created_at', { ascending: true }),
  ])
  if (c.error) throw new Error(c.error.message)
  if (cr.error) throw new Error(cr.error.message)
  return { campaigns: (c.data ?? []) as Campaign[], creatives: (cr.data ?? []) as Creative[] }
}

export async function getCampaign(id: string): Promise<{ campaign: Campaign; creatives: Creative[] } | null> {
  await requireAdminSession()
  if (!UUID.test(id)) return null
  const admin = createAdminClient()
  const [c, cr] = await Promise.all([
    admin.from('ad_campaigns').select('*').eq('id', id).maybeSingle(),
    admin.from('ad_creatives').select('*').eq('campaign_id', id).order('created_at', { ascending: true }),
  ])
  if (!c.data) return null
  return { campaign: c.data as Campaign, creatives: (cr.data ?? []) as Creative[] }
}

export async function saveCampaign(id: string | null, input: CampaignInput): Promise<Result<{ id: string }>> {
  await requireAdminSession()
  const cleaned = clean(input)
  if (!cleaned.ok) return cleaned
  const admin = createAdminClient()
  if (id) {
    if (!UUID.test(id)) return fail('Invalid campaign')
    const { error } = await admin.from('ad_campaigns').update(cleaned.row).eq('id', id)
    if (error) return fail(error.message)
    await audit('Edited ad campaign', String(cleaned.row.name))
    revalidate(id)
    return { ok: true, id }
  }
  const { data, error } = await admin.from('ad_campaigns').insert(cleaned.row).select('id').single()
  if (error || !data) return fail(error?.message ?? 'Could not create the campaign')
  await audit('Created ad campaign', String(cleaned.row.name))
  revalidate()
  return { ok: true, id: data.id }
}

export async function setCampaignStatus(id: string, status: Campaign['status']): Promise<Result> {
  await requireAdminSession()
  if (!UUID.test(id) || !['active', 'paused', 'archived'].includes(status)) return fail('Invalid')
  const { data, error } = await createAdminClient()
    .from('ad_campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('name')
    .single()
  if (error) return fail(error.message)
  await audit(status === 'active' ? 'Started ad campaign' : status === 'paused' ? 'Paused ad campaign' : 'Archived ad campaign', data?.name ?? id)
  revalidate(id)
  return { ok: true }
}

// A copy to tweak, paused so it doesn't start serving by surprise. Its ads
// share the same files.
export async function duplicateCampaign(id: string): Promise<Result<{ id: string }>> {
  await requireAdminSession()
  const found = await getCampaign(id)
  if (!found) return fail('Campaign not found')
  const { campaign: c, creatives } = found
  const admin = createAdminClient()
  const copy: Record<string, unknown> = { ...c, name: `${c.name} (copy)`.slice(0, 80), status: 'paused' }
  for (const k of ['id', 'report_token', 'created_at', 'updated_at']) delete copy[k]
  const { data, error } = await admin.from('ad_campaigns').insert(copy).select('id').single()
  if (error || !data) return fail(error?.message ?? 'Could not copy it')
  if (creatives.length) {
    await admin
      .from('ad_creatives')
      .insert(creatives.map((cr) => ({ campaign_id: data.id, name: cr.name, kind: cr.kind, media_url: cr.media_url, status: cr.status })))
  }
  await audit('Copied ad campaign', c.name)
  revalidate()
  return { ok: true, id: data.id }
}

// Deletes the campaign and its stats. Files are kept if another campaign
// still uses them.
export async function deleteCampaign(id: string): Promise<Result> {
  await requireAdminSession()
  const found = await getCampaign(id)
  if (!found) return fail('Campaign not found')
  const admin = createAdminClient()
  const { error } = await admin.from('ad_campaigns').delete().eq('id', id)
  if (error) return fail(error.message)
  await Promise.all(found.creatives.map((cr) => removeFileIfUnused(cr.media_url)))
  await audit('Deleted ad campaign', found.campaign.name)
  revalidate()
  return { ok: true }
}

// A new share link; the old one stops working.
export async function resetReportLink(id: string): Promise<Result<{ token: string }>> {
  await requireAdminSession()
  if (!UUID.test(id)) return fail('Invalid')
  const token = crypto.randomUUID()
  const { error } = await createAdminClient().from('ad_campaigns').update({ report_token: token }).eq('id', id)
  if (error) return fail(error.message)
  await audit('Reset ad report link', id)
  return { ok: true, token }
}

// ── Creatives ──────────────────────────────────────────────────────────

// Uploads go straight from the browser to Storage with a one-time signed
// link, so file size isn't limited by server actions (1 MB) or Vercel's
// request cap (4.5 MB) — big photos and videos work.
export async function createAdUpload(fileName: string): Promise<{ path: string; token: string }> {
  await requireAdminSession()
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { data, error } = await createAdminClient().storage.from('ads').createSignedUploadUrl(path)
  if (error || !data) throw new Error(error?.message ?? 'Could not start the upload')
  return { path: data.path, token: data.token }
}

export async function addCreative(input: { campaignId: string; path: string; kind: 'image' | 'video'; name: string }): Promise<Result<{ creative: Creative }>> {
  await requireAdminSession()
  if (!UUID.test(input.campaignId)) return fail('Invalid campaign')
  if (!['image', 'video'].includes(input.kind)) return fail('Invalid file type')
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/.test(input.path)) return fail('Invalid upload')
  const admin = createAdminClient()
  const {
    data: { publicUrl },
  } = admin.storage.from('ads').getPublicUrl(input.path)
  const { data, error } = await admin
    .from('ad_creatives')
    .insert({ campaign_id: input.campaignId, kind: input.kind, media_url: publicUrl, name: input.name.trim().slice(0, 80) })
    .select('*')
    .single()
  if (error || !data) return fail(error?.message ?? 'Could not save the ad')
  await audit('Added ad', input.name, { campaign: input.campaignId })
  revalidate(input.campaignId)
  return { ok: true, creative: data as Creative }
}

export async function updateCreative(id: string, patch: { name?: string; status?: 'active' | 'paused' }): Promise<Result> {
  await requireAdminSession()
  if (!UUID.test(id)) return fail('Invalid')
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name.trim().slice(0, 80)
  if (patch.status !== undefined) {
    if (!['active', 'paused'].includes(patch.status)) return fail('Invalid')
    row.status = patch.status
  }
  const { data, error } = await createAdminClient().from('ad_creatives').update(row).eq('id', id).select('campaign_id, name').single()
  if (error) return fail(error.message)
  if (patch.status) await audit(patch.status === 'active' ? 'Turned ad on' : 'Turned ad off', data?.name || id)
  revalidate(data?.campaign_id)
  return { ok: true }
}

export async function deleteCreative(id: string): Promise<Result> {
  await requireAdminSession()
  if (!UUID.test(id)) return fail('Invalid')
  const admin = createAdminClient()
  const { data, error } = await admin.from('ad_creatives').delete().eq('id', id).select('campaign_id, media_url, name').single()
  if (error) return fail(error.message)
  if (data) await removeFileIfUnused(data.media_url)
  await audit('Deleted ad', data?.name || id)
  revalidate(data?.campaign_id)
  return { ok: true }
}

async function removeFileIfUnused(mediaUrl: string) {
  const admin = createAdminClient()
  const { count: uses } = await admin.from('ad_creatives').select('id', { count: 'exact', head: true }).eq('media_url', mediaUrl)
  if (uses) return
  const path = mediaUrl.split('/ads/').pop()
  if (path) await admin.storage.from('ads').remove([path])
}

// ── Reports ────────────────────────────────────────────────────────────

export async function getReport(from: string, to: string, tz: string, campaignId: string | null = null): Promise<Report> {
  await requireAdminSession()
  if (campaignId && !UUID.test(campaignId)) throw new Error('Invalid campaign')
  return buildReport(from, to, tz, campaignId)
}

// ── Placement settings ─────────────────────────────────────────────────

// Seconds a full-screen ad must play before it can be closed (rewarded:
// before the reward is earned).
export async function getAdSettings(): Promise<Record<string, number>> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().from('ad_settings').select('placement, unlock_seconds')
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map((r) => [r.placement, r.unlock_seconds]))
}

export async function setUnlockSeconds(placement: AdPlacement, seconds: number): Promise<Result> {
  await requireAdminSession()
  if (!['interstitial', 'rewarded'].includes(placement)) return fail('Invalid placement')
  const value = Math.round(seconds)
  if (!Number.isFinite(value) || value < 0 || value > 120) return fail('Pick between 0 and 120 seconds')
  const { error } = await createAdminClient().from('ad_settings').upsert({ placement, unlock_seconds: value })
  if (error) return fail(error.message)
  await audit('Changed ad skip time', placement, { seconds: value })
  return { ok: true }
}
