'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createClient } from '@supabase/supabase-js'
import { Loader2, Upload, Trash2, Minimize2 } from 'lucide-react'
import { toast } from 'sonner'
import { createAdUpload, saveAd, toggleAdActive, deleteAd, removeAdFile, restoreAd, type AdPlacement } from './actions'

// Images over this are slow to load in the game; offer to shrink them.
const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_IMAGE_SIDE = 1920

function formatBytes(n: number) {
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

type Ad = {
  id: string
  kind: 'image' | 'video'
  placement: AdPlacement
  media_url: string
  click_url: string | null
  active: boolean
  created_at: string
}

// `size` is the recommended media size for how each ad is shown in game.
const PLACEMENTS: { value: AdPlacement; label: string; hint: string; size: string }[] = [
  { value: 'rewarded', label: 'Rewarded video', hint: 'Watch-to-claim ads (bonus truck drop)', size: '1280 × 720 (16:9)' },
  { value: 'interstitial', label: 'Interstitial', hint: 'Full-screen, shown when a site is cleared', size: '1280 × 720 (16:9)' },
  { value: 'banner', label: 'Banner', hint: 'Persistent strip at the bottom of the screen', size: '1200 × 175 (wide strip)' },
  { value: 'billboard', label: 'Billboard', hint: 'On the 3D billboards behind the home lot', size: '1280 × 720 (16:9)' },
]

export default function AdManager({ initialAds }: { initialAds: Ad[] }) {
  const [ads, setAds] = useState(initialAds)
  const [placement, setPlacement] = useState<AdPlacement>('rewarded')
  const [clickUrl, setClickUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [shrinking, setShrinking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Ads whose delete failed part-way: shown red with Delete / Recover.
  // stage 'row' = nothing was deleted; 'file' = the row is gone but the
  // file is still in Storage (so Recover can put the row back).
  const [failed, setFailed] = useState<Record<string, { stage: 'row' | 'file'; message: string }>>({})
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const pickFile = async (picked: File | null) => {
    setFile(picked)
    setDims(picked?.type.startsWith('image/') ? await imageSize(picked) : null)
  }

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
    setUploading(true)
    try {
      const { path, token } = await createAdUpload(file.name)
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { error } = await supabase.storage.from('ads').uploadToSignedUrl(path, token, file, { contentType: file.type })
      if (error) throw new Error(error.message)
      await saveAd({ path, kind: file.type.startsWith('video/') ? 'video' : 'image', placement, clickUrl })
      toast.success('Ad added')
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setUploading(false)
    }
  }

  const handleToggle = (id: string, active: boolean) => {
    setBusyId(id)
    startTransition(async () => {
      try {
        await toggleAdActive(id, active)
        setAds((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  const clearFailed = (id: string) =>
    setFailed((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const handleDelete = (ad: Ad, confirmFirst = true) => {
    if (confirmFirst && !confirm('Delete this ad?')) return
    const prior = failed[ad.id]
    setBusyId(ad.id)
    startTransition(async () => {
      try {
        const result = prior?.stage === 'file' ? await removeAdFile(ad.media_url) : await deleteAd(ad.id, ad.media_url)
        if (result.ok) {
          setAds((prev) => prev.filter((a) => a.id !== ad.id))
          clearFailed(ad.id)
        } else {
          setFailed((prev) => ({ ...prev, [ad.id]: { stage: result.stage, message: result.message } }))
        }
      } catch {
        setFailed((prev) => ({ ...prev, [ad.id]: { stage: prior?.stage ?? 'row', message: 'Network error' } }))
      } finally {
        setBusyId(null)
      }
    })
  }

  const handleRecover = (ad: Ad) => {
    const f = failed[ad.id]
    if (f?.stage !== 'file') {
      // Nothing was deleted; just put it back to normal.
      clearFailed(ad.id)
      return
    }
    setBusyId(ad.id)
    startTransition(async () => {
      try {
        const result = await restoreAd(ad)
        if (result.ok) clearFailed(ad.id)
        else toast.error(result.message ?? "Couldn't recover the ad")
      } catch {
        toast.error("Couldn't recover the ad")
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">Ads admin</h1>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Add an ad</p>

        <Select value={placement} onChange={(e) => setPlacement(e.target.value as AdPlacement)}>
          {PLACEMENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} — {p.size}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Best size: <span className="font-medium text-foreground">{PLACEMENTS.find((p) => p.value === placement)?.size}</span>
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          {file?.name ?? 'Choose image or video'}
        </Button>
        {file && (
          <p className="text-xs text-muted-foreground">
            {dims ? `${dims.w} × ${dims.h} · ` : ''}
            {formatBytes(file.size)}
          </p>
        )}
        {file?.type.startsWith('image/') && file.size > MAX_IMAGE_BYTES && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#fff4d6] p-3">
            <p className="text-xs text-[#7a5a00]">
              This image is {formatBytes(file.size)} — over the {formatBytes(MAX_IMAGE_BYTES)} limit, so it&apos;d load slowly in game.
            </p>
            <Button type="button" variant="secondary" onClick={handleShrink} disabled={shrinking || uploading} className="shrink-0">
              {shrinking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Minimize2 className="w-4 h-4 mr-2" />}
              Shrink to correct size
            </Button>
          </div>
        )}
        <Input
          value={clickUrl}
          onChange={(e) => setClickUrl(e.target.value)}
          placeholder="Click-through link (optional)"
          disabled={uploading}
        />
        <Button onClick={handleUpload} disabled={uploading || shrinking || !file} className="w-full">
          {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Upload
        </Button>
      </div>

      {PLACEMENTS.map((p) => {
        const adsForPlacement = ads.filter((a) => a.placement === p.value)
        return (
          <div key={p.value} className="space-y-2">
            <div>
              <p className="text-sm font-bold">
                {p.label} <span className="font-normal text-muted-foreground">· {p.size}</span>
              </p>
              <p className="text-xs text-muted-foreground">{p.hint}</p>
            </div>
            {adsForPlacement.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No ads yet.</p>
            )}
            {adsForPlacement.map((ad) => (
              <div
                key={ad.id}
                className={`rounded-xl border p-3 ${failed[ad.id] ? 'border-red-400 bg-red-50' : 'border-border bg-card'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-secondary shrink-0">
                    {ad.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                      <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={ad.media_url} className="w-full h-full object-cover" muted />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground uppercase font-mono">{ad.kind}</p>
                    {ad.click_url && <p className="text-xs text-muted-foreground truncate">{ad.click_url}</p>}
                  </div>
                  {!failed[ad.id] && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === ad.id}
                        onClick={() => handleToggle(ad.id, !ad.active)}
                        className="text-xs font-medium px-2.5 py-1 rounded-full border border-border disabled:opacity-50"
                      >
                        {ad.active ? 'Active' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ad.id}
                        onClick={() => handleDelete(ad)}
                        className="text-destructive p-2 disabled:opacity-50"
                      >
                        {busyId === ad.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </>
                  )}
                </div>
                {failed[ad.id] && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-red-700">
                      {failed[ad.id].stage === 'row'
                        ? "Couldn't delete this ad — it's still live."
                        : 'Removed from the game, but its file couldn\'t be deleted.'}{' '}
                      <span className="font-normal opacity-80">({failed[ad.id].message})</span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === ad.id}
                        onClick={() => handleDelete(ad, false)}
                        className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busyId === ad.id ? 'Working…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ad.id}
                        onClick={() => handleRecover(ad)}
                        className="flex-1 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                      >
                        Recover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
