'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

// The ads admin is a media library: an upload (ad_media) can be assigned to
// several ad types; each assignment is a row in `ads` with its own on/off
// switch, schedule and stats. Writes return results rather than throwing,
// because production hides thrown server-action messages.

export type AdPlacement = 'rewarded' | 'interstitial' | 'banner' | 'billboard'
const PLACEMENT_VALUES: AdPlacement[] = ['rewarded', 'interstitial', 'banner', 'billboard']

export type Assignment = {
  id: string
  media_id: string
  placement: AdPlacement
  active: boolean
  starts_at: string | null
  ends_at: string | null
}

export type Media = {
  id: string
  kind: 'image' | 'video'
  media_url: string
  click_url: string | null
  active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  ads: Assignment[]
}

export type Result = { ok: true } | { ok: false; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(message: string): Result {
  return { ok: false, message }
}

function validWindow(startsAt: string | null, endsAt: string | null) {
  return !(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt))
}

// ── Uploading ────────────────────────────────────────────────────────────

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

// Called once the file is in Storage: adds it to the library, assigned to
// whichever ad types were ticked (possibly none yet).
export async function saveMedia(input: {
  path: string
  kind: 'image' | 'video'
  clickUrl: string
  placements: AdPlacement[]
}): Promise<Result> {
  await requireAdminSession()
  if (!['image', 'video'].includes(input.kind)) return fail('Invalid file type')
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/.test(input.path)) return fail('Invalid upload')
  if (input.placements.some((p) => !PLACEMENT_VALUES.includes(p))) return fail('Invalid ad type')

  const admin = createAdminClient()
  const {
    data: { publicUrl },
  } = admin.storage.from('ads').getPublicUrl(input.path)
  const { data: media, error } = await admin
    .from('ad_media')
    .insert({ kind: input.kind, media_url: publicUrl, click_url: input.clickUrl.trim() || null })
    .select('id')
    .single()
  if (error || !media) return fail(error?.message ?? 'Could not save the upload')

  if (input.placements.length) {
    const { error: assignError } = await admin
      .from('ads')
      .insert(input.placements.map((placement) => ({ media_id: media.id, placement, active: true })))
    if (assignError) return fail(assignError.message)
  }
  revalidatePath('/admin/ads')
  return { ok: true }
}

// ── The upload (master switch, schedule, link) ───────────────────────────

export async function setMediaActive(id: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('ad_media').update({ active }).eq('id', id)
  return error ? fail(error.message) : { ok: true }
}

// Scheduling also switches it on, since a schedule on a hidden upload
// would never show.
export async function setMediaSchedule(id: string, startsAt: string | null, endsAt: string | null): Promise<Result> {
  await requireAdminSession()
  if (!validWindow(startsAt, endsAt)) return fail('End must be after start')
  const { error } = await createAdminClient()
    .from('ad_media')
    .update({ starts_at: startsAt, ends_at: endsAt, ...(startsAt || endsAt ? { active: true } : {}) })
    .eq('id', id)
  return error ? fail(error.message) : { ok: true }
}

export async function setMediaClickUrl(id: string, clickUrl: string): Promise<Result> {
  await requireAdminSession()
  const url = clickUrl.trim()
  if (url && !/^https?:\/\//i.test(url)) return fail('Links must start with http:// or https://')
  const { error } = await createAdminClient().from('ad_media').update({ click_url: url || null }).eq('id', id)
  return error ? fail(error.message) : { ok: true }
}

// ── Assignments (one per ad type) ────────────────────────────────────────

export async function assignPlacement(mediaId: string, placement: AdPlacement): Promise<{ ok: true; ad: Assignment } | { ok: false; message: string }> {
  await requireAdminSession()
  if (!UUID.test(mediaId) || !PLACEMENT_VALUES.includes(placement)) return { ok: false, message: 'Invalid ad type' }
  const { data, error } = await createAdminClient()
    .from('ads')
    .insert({ media_id: mediaId, placement, active: true })
    .select('id, media_id, placement, active, starts_at, ends_at')
    .single()
  if (error || !data) return { ok: false, message: error?.message ?? 'Could not add it' }
  return { ok: true, ad: data as Assignment }
}

// Removing a type deletes that type's stats with it.
export async function unassignPlacement(adId: string): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('ads').delete().eq('id', adId)
  return error ? fail(error.message) : { ok: true }
}

export async function setAdActive(adId: string, active: boolean): Promise<Result> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('ads').update({ active }).eq('id', adId)
  return error ? fail(error.message) : { ok: true }
}

export async function setAdSchedule(adId: string, startsAt: string | null, endsAt: string | null): Promise<Result> {
  await requireAdminSession()
  if (!validWindow(startsAt, endsAt)) return fail('End must be after start')
  const { error } = await createAdminClient()
    .from('ads')
    .update({ starts_at: startsAt, ends_at: endsAt, ...(startsAt || endsAt ? { active: true } : {}) })
    .eq('id', adId)
  return error ? fail(error.message) : { ok: true }
}

// ── Deleting ─────────────────────────────────────────────────────────────

export type DeleteResult = { ok: true } | { ok: false; stage: 'row' | 'file'; message: string }

// Removes the upload (its assignments and their stats go with it), then its
// file. If the row went but the file didn't, the file is still there, so
// restoreMedia can put everything back.
export async function deleteMedia(id: string, mediaUrl: string): Promise<DeleteResult> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('ad_media').delete().eq('id', id)
  if (error) return { ok: false, stage: 'row', message: error.message }
  revalidatePath('/admin/ads')
  return removeAdFile(mediaUrl)
}

// Retry for a delete that removed the row but not the file.
export async function removeAdFile(mediaUrl: string): Promise<DeleteResult> {
  await requireAdminSession()
  const path = mediaUrl.split('/ads/').pop()
  if (!path) return { ok: true }
  const { error } = await createAdminClient().storage.from('ads').remove([path])
  if (error) return { ok: false, stage: 'file', message: error.message }
  return { ok: true }
}

// Undo a half-finished delete: puts the upload and its assignments back
// (stats can't come back — they were removed with the row).
export async function restoreMedia(media: Media): Promise<Result> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { error } = await admin.from('ad_media').upsert({
    id: media.id,
    kind: media.kind,
    media_url: media.media_url,
    click_url: media.click_url,
    active: media.active,
    starts_at: media.starts_at,
    ends_at: media.ends_at,
    created_at: media.created_at,
  })
  if (error) return fail(error.message)
  if (media.ads.length) {
    const { error: adsError } = await admin.from('ads').upsert(
      media.ads.map((a) => ({
        id: a.id,
        media_id: media.id,
        placement: a.placement,
        active: a.active,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
      }))
    )
    if (adsError) return fail(adsError.message)
  }
  revalidatePath('/admin/ads')
  return { ok: true }
}

// ── Stats ────────────────────────────────────────────────────────────────

export type AdStats = {
  views: number
  uniques: number
  completes: number
  skips: number
  clicks: number
  bricks: number
}

type StatsRow = { views: number; uniques: number; completes: number; skips: number; clicks: number; bricks: number }

function toStats(r: StatsRow): AdStats {
  return {
    views: Number(r.views),
    uniques: Number(r.uniques),
    completes: Number(r.completes),
    skips: Number(r.skips),
    clicks: Number(r.clicks),
    bricks: Number(r.bricks),
  }
}

// Since `since` (ISO; the browser computes it so "Today" is the admin's
// local midnight): per assignment (each ad type) and per upload (totals,
// with unique players counted across its types).
export async function getStats(since: string): Promise<{ byAd: Record<string, AdStats>; byMedia: Record<string, AdStats> }> {
  await requireAdminSession()
  const admin = createAdminClient()
  const [perAd, perMedia] = await Promise.all([admin.rpc('ad_stats', { since }), admin.rpc('ad_media_stats', { since })])
  if (perAd.error) throw new Error(perAd.error.message)
  if (perMedia.error) throw new Error(perMedia.error.message)
  const byAd: Record<string, AdStats> = {}
  for (const r of perAd.data ?? []) byAd[r.ad_id] = toStats(r)
  const byMedia: Record<string, AdStats> = {}
  for (const r of perMedia.data ?? []) byMedia[r.media_id] = toStats(r)
  return { byAd, byMedia }
}

// Views per assignment per day for the last 7 days, in the admin's zone.
export async function getDailyViews(tz: string): Promise<Record<string, Record<string, number>>> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().rpc('ad_daily_views', { days: 7, tz })
  if (error) throw new Error(error.message)
  const out: Record<string, Record<string, number>> = {}
  for (const r of data ?? []) (out[r.ad_id] ??= {})[r.day] = Number(r.views)
  return out
}

// ── Timing ───────────────────────────────────────────────────────────────

// Seconds an ad must play before it can be closed, per ad type.
export async function getAdSettings(): Promise<Record<string, number>> {
  await requireAdminSession()
  const { data, error } = await createAdminClient().from('ad_settings').select('placement, unlock_seconds')
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map((r) => [r.placement, r.unlock_seconds]))
}

export async function setUnlockSeconds(placement: 'interstitial' | 'rewarded', seconds: number): Promise<Result> {
  await requireAdminSession()
  if (!['interstitial', 'rewarded'].includes(placement)) return fail('Invalid ad type')
  const value = Math.round(seconds)
  if (!Number.isFinite(value) || value < 0 || value > 120) return fail('Pick between 0 and 120 seconds')
  const { error } = await createAdminClient().from('ad_settings').upsert({ placement, unlock_seconds: value })
  return error ? fail(error.message) : { ok: true }
}
