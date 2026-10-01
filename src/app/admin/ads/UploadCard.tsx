'use client'

import { useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Eye, Loader2, Minimize2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAdUpload, saveMedia, type AdPlacement } from './actions'
import { PLACEMENTS, type Preview } from './placements'

// Images over this are slow to load in the game; offer to shrink them.
const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_IMAGE_SIDE = 1920
// The ads storage bucket's own limit.
const MAX_UPLOAD_BYTES = 20_000_000

export function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

// Re-encodes an image as JPEG, keeping its shape: caps the long side, then
// steps quality (and if needed size) down until it fits under maxBytes.
async function shrinkImage(file: File, maxBytes: number): Promise<File> {
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

async function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { w: bitmap.width, h: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

// Upload an image or video into the library and tick which ad types it
// runs as (any number, or none to just keep it in the library for now).
export default function UploadCard({ onPreview }: { onPreview: (p: Preview) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [types, setTypes] = useState<AdPlacement[]>([])
  const [clickUrl, setClickUrl] = useState('')
  const [shrinking, setShrinking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = async (picked: File | null) => {
    setFile(picked)
    setDims(picked?.type.startsWith('image/') ? await imageSize(picked) : null)
  }

  const toggleType = (p: AdPlacement) => setTypes((prev) => (prev.includes(p) ? prev.filter((t) => t !== p) : [...prev, p]))

  const handleShrink = async () => {
    if (!file) return
    setShrinking(true)
    try {
      const small = await shrinkImage(file, MAX_IMAGE_BYTES)
      await pickFile(small)
      toast.success(`Shrunk to ${formatBytes(small.size)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't shrink this image")
    } finally {
      setShrinking(false)
    }
  }

  const handleUpload = async () => {
    if (!file || uploading) return
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`)
      return
    }
    setUploading(true)
    try {
      const { path, token } = await createAdUpload(file.name)
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { error } = await supabase.storage.from('ads').uploadToSignedUrl(path, token, file, { contentType: file.type })
      if (error) throw new Error(error.message)
      const result = await saveMedia({ path, kind: file.type.startsWith('video/') ? 'video' : 'image', clickUrl, placements: types })
      if (!result.ok) throw new Error(result.message)
      toast.success('Uploaded')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setUploading(false)
    }
  }

  const sizes = [...new Set(PLACEMENTS.filter((p) => types.includes(p.value)).map((p) => p.size))]

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">Upload</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full">
        <Upload className="w-4 h-4 mr-2 shrink-0" />
        <span className="min-w-0 truncate">{file?.name ?? 'Choose image or video'}</span>
      </Button>
      {file && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {dims ? `${dims.w} × ${dims.h} · ` : ''}
            {formatBytes(file.size)}
          </p>
          <button
            type="button"
            onClick={() => onPreview({ kind: file.type.startsWith('video/') ? 'video' : 'image', url: URL.createObjectURL(file) })}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#2d7ff9]"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
        </div>
      )}
      {file?.type.startsWith('image/') && file.size > MAX_IMAGE_BYTES && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#fff4d6] p-3">
          <p className="text-xs text-[#7a5a00]">
            This image is {formatBytes(file.size)} — over {formatBytes(MAX_IMAGE_BYTES)}, so it&apos;d load slowly in game.
          </p>
          <Button type="button" variant="secondary" onClick={handleShrink} disabled={shrinking || uploading} className="shrink-0">
            {shrinking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Minimize2 className="w-4 h-4 mr-2" />}
            Shrink to correct size
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Use it as</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PLACEMENTS.map((p) => {
            const on = types.includes(p.value)
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggleType(p.value)}
                aria-pressed={on}
                className={`rounded-xl border px-3 py-2 text-left text-xs ${
                  on ? 'border-[#2d7ff9] bg-[#2d7ff9]/10 font-medium text-foreground' : 'border-border text-muted-foreground'
                }`}
              >
                {on ? '☑' : '☐'} {p.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {sizes.length ? (
            <>
              Best size: <span className="font-medium text-foreground">{sizes.join(' / ')}</span>
            </>
          ) : (
            'Tick none to just keep it in the library for now.'
          )}
        </p>
      </div>

      <Input value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} placeholder="Click-through link (optional)" disabled={uploading} />
      <Button onClick={handleUpload} disabled={uploading || shrinking || !file} className="w-full">
        {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Upload
      </Button>
    </div>
  )
}
