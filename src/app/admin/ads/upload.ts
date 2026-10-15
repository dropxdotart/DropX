'use client'

import { createClient } from '@supabase/supabase-js'
import { createAdUpload } from './actions'

// Images over this are slow to load in the game; offer to shrink them.
export const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_IMAGE_SIDE = 1920
// The ads storage bucket's own limit.
export const MAX_UPLOAD_BYTES = 20_000_000

export function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

// Re-encodes an image as JPEG, keeping its shape: caps the long side, then
// steps quality (and if needed size) down until it fits under maxBytes.
export async function shrinkImage(file: File, maxBytes = MAX_IMAGE_BYTES): Promise<File> {
  const bitmap = await createImageBitmap(file)
  let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  let quality = 0.85
  let best: Blob | null = null
  for (let i = 0; i < 10; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = '#ffffff' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob) best = blob
    if (blob && blob.size <= maxBytes) break
    if (quality > 0.6) quality -= 0.1
    else scale *= 0.8
  }
  bitmap.close()
  if (!best) throw new Error("Couldn't shrink this image")
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([best], name, { type: 'image/jpeg' })
}

// Straight from the browser to Storage with a one-time signed link.
export async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`)
  const { path, token } = await createAdUpload(file.name)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { error } = await supabase.storage.from('ads').uploadToSignedUrl(path, token, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

// Whether the browser can actually play a video (e.g. .mov outside Safari
// can't) — players on other browsers would see nothing.
export function canPlayVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (ok: boolean) => {
      URL.revokeObjectURL(url)
      resolve(ok)
    }
    v.muted = true
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(v.videoWidth > 0)
    v.onerror = () => done(false)
    setTimeout(() => done(false), 8000)
    v.src = url
  })
}
