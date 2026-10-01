'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

export type AdPlacement = 'rewarded' | 'interstitial' | 'banner' | 'billboard'

const PLACEMENT_VALUES: AdPlacement[] = ['rewarded', 'interstitial', 'banner', 'billboard']

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

// Called once the file is in Storage: records the ad.
export async function saveAd(input: {
  path: string
  kind: 'image' | 'video'
  placement: AdPlacement
  clickUrl: string
}): Promise<void> {
  await requireAdminSession()
  if (!PLACEMENT_VALUES.includes(input.placement)) throw new Error('Invalid placement')
  if (!['image', 'video'].includes(input.kind)) throw new Error('Invalid file type')
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/.test(input.path)) throw new Error('Invalid upload')

  const admin = createAdminClient()
  const {
    data: { publicUrl },
  } = admin.storage.from('ads').getPublicUrl(input.path)
  const { error } = await admin
    .from('ads')
    .insert({ kind: input.kind, placement: input.placement, media_url: publicUrl, click_url: input.clickUrl.trim() || null })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/ads')
}

export async function toggleAdActive(id: string, active: boolean): Promise<void> {
  await requireAdminSession()
  const admin = createAdminClient()
  const { error } = await admin.from('ads').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/ads')
}

export type DeleteResult = { ok: true } | { ok: false; stage: 'row' | 'file'; message: string }

// Removes the ad's row, then its file. Returns (rather than throws) a
// failure so the admin can see what went wrong: production hides thrown
// server-action messages. If the row went but the file didn't, the file is
// still there, so the ad can be recovered with restoreAd.
export async function deleteAd(id: string, mediaUrl: string): Promise<DeleteResult> {
  await requireAdminSession()
  const admin = createAdminClient()

  const { error } = await admin.from('ads').delete().eq('id', id)
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

// Undo a half-finished delete: puts the ad's row back as it was.
export async function restoreAd(ad: {
  id: string
  kind: 'image' | 'video'
  placement: AdPlacement
  media_url: string
  click_url: string | null
  active: boolean
}): Promise<{ ok: boolean; message?: string }> {
  await requireAdminSession()
  const { error } = await createAdminClient().from('ads').upsert(ad)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/ads')
  return { ok: true }
}
