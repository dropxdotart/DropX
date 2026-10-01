'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Loader2, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadAd, toggleAdActive, deleteAd, type AdPlacement } from './actions'

type Ad = {
  id: string
  kind: 'image' | 'video'
  placement: AdPlacement
  media_url: string
  click_url: string | null
  active: boolean
  created_at: string
}

const PLACEMENTS: { value: AdPlacement; label: string; hint: string }[] = [
  { value: 'rewarded', label: 'Rewarded video', hint: 'Opt-in "watch for a bonus" button' },
  { value: 'interstitial', label: 'Interstitial', hint: 'Full-screen, shown after demolishing a structure' },
  { value: 'banner', label: 'Banner', hint: 'Persistent strip at the bottom of the screen' },
]

export default function AdManager({ initialAds }: { initialAds: Ad[] }) {
  const [ads, setAds] = useState(initialAds)
  const [placement, setPlacement] = useState<AdPlacement>('rewarded')
  const [clickUrl, setClickUrl] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0]
    if (!file || uploading) return
    setUploading(true)
    const formData = new FormData()
    formData.set('file', file)
    formData.set('clickUrl', clickUrl)
    formData.set('placement', placement)
    startTransition(async () => {
      try {
        await uploadAd(formData)
        toast.success('Ad added')
        setClickUrl('')
        setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setUploading(false)
      }
    })
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

  const handleDelete = (id: string, mediaUrl: string) => {
    if (!confirm('Delete this ad?')) return
    setBusyId(id)
    startTransition(async () => {
      try {
        await deleteAd(id, mediaUrl)
        setAds((prev) => prev.filter((a) => a.id !== id))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
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
              {p.label}
            </option>
          ))}
        </Select>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          {fileName ?? 'Choose image or video'}
        </Button>
        <Input
          value={clickUrl}
          onChange={(e) => setClickUrl(e.target.value)}
          placeholder="Click-through link (optional)"
          disabled={uploading}
        />
        <Button onClick={handleUpload} disabled={uploading || !fileName} className="w-full">
          {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Upload
        </Button>
      </div>

      {PLACEMENTS.map((p) => {
        const adsForPlacement = ads.filter((a) => a.placement === p.value)
        return (
          <div key={p.value} className="space-y-2">
            <div>
              <p className="text-sm font-bold">{p.label}</p>
              <p className="text-xs text-muted-foreground">{p.hint}</p>
            </div>
            {adsForPlacement.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No ads yet.</p>
            )}
            {adsForPlacement.map((ad) => (
              <div key={ad.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
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
                  onClick={() => handleDelete(ad.id, ad.media_url)}
                  className="text-destructive p-2 disabled:opacity-50"
                >
                  {busyId === ad.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
