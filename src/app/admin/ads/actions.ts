'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminSession } from '../auth'

export async function uploadAd(formData: FormData): Promise<void> {
  await requireAdminSession()

  const file = formData.get('file')
  const clickUrl = (formData.get('clickUrl') as string | null)?.trim() || null
  if (!(file instanceof File) || file.size === 0) throw new Error('No file provided')

  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  const admin = createAdminClient()
  const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')
  const path = `${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await admin.storage.from('ads').upload(path, file, { contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: { publicUrl } } = admin.storage.from('ads').getPublicUrl(path)

  const { error } = await admin.from('ads').insert({ kind, media_url: publicUrl, click_url: clickUrl })
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

export async function deleteAd(id: string, mediaUrl: string): Promise<void> {
  await requireAdminSession()
  const admin = createAdminClient()

  const { error } = await admin.from('ads').delete().eq('id', id)
  if (error) throw new Error(error.message)

  const path = mediaUrl.split('/ads/').pop()
  if (path) await admin.storage.from('ads').remove([path])

  revalidatePath('/admin/ads')
}
