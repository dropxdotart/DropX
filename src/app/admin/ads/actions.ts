'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const COOKIE_NAME = 'ads_admin_session'

// The cookie itself never holds the password — only this server action can
// set it, and only after checking the real password against the env var,
// so a visitor can't forge their way past the gate without knowing it.
// There's no per-user role system anymore after the rebuild, so this
// shared-password gate is the whole security model for this one internal
// tool — deliberately not more than that.
export async function checkAdminPassword(password: string): Promise<{ ok: boolean }> {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error('ADMIN_PASSWORD is not configured')
  const ok = password === expected
  if (ok) {
    const store = await cookies()
    store.set(COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/admin/ads',
    })
  }
  return { ok }
}

async function requireAdminSession() {
  const store = await cookies()
  if (store.get(COOKIE_NAME)?.value !== 'true') throw new Error('Not authorized')
}

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
