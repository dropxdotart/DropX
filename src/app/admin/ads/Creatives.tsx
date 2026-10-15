'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Maximize2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { addCreative, deleteCreative, updateCreative } from './actions'
import { toastResult } from './AdsOverview'
import { MediaThumb } from './ReportView'
import { canPlayVideo, formatBytes, MAX_IMAGE_BYTES, shrinkImage, uploadFile } from './upload'
import { completion, ctr, num, pct, PLACEMENTS, ZERO, type Campaign, type Creative, type Report } from './shared'

// A campaign's ads: upload more, rename, switch each on/off, see how each
// one does. Several active ads rotate at random.
export default function Creatives({ campaign, creatives, report }: { campaign: Campaign; creatives: Creative[]; report: Report | null }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [preview, setPreview] = useState<Creative | null>(null)
  const sizes = [...new Set(PLACEMENTS.filter((p) => campaign.placements.includes(p.value)).map((p) => `${p.label} ${p.size}`))]

  const upload = async (picked: FileList | null) => {
    const files = [...(picked ?? [])]
    if (fileRef.current) fileRef.current.value = ''
    for (let file of files) {
      try {
        const isVideo = file.type.startsWith('video/')
        if (isVideo && !(await canPlayVideo(file))) {
          toast.error(`${file.name}: this video format won't play in most browsers. Export it as MP4 (H.264).`)
          continue
        }
        if (!isVideo && file.size > MAX_IMAGE_BYTES) {
          setStatus(`Shrinking ${file.name}…`)
          const before = file.size
          file = await shrinkImage(file)
          toast.message(`Shrunk ${formatBytes(before)} → ${formatBytes(file.size)} so it loads fast in game`)
        }
        setStatus(`Uploading ${file.name}…`)
        const path = await uploadFile(file)
        const r = await addCreative({ campaignId: campaign.id, path, kind: isVideo ? 'video' : 'image', name: file.name.replace(/\.[^.]+$/, '') })
        toastResult(r, `Added ${file.name}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Upload failed')
      }
    }
    setStatus(null)
    router.refresh()
  }

  const rename = async (cr: Creative, name: string) => {
    if (name.trim() === cr.name) return
    if (toastResult(await updateCreative(cr.id, { name }))) router.refresh()
  }
  const toggle = async (cr: Creative, on: boolean) => {
    if (toastResult(await updateCreative(cr.id, { status: on ? 'active' : 'paused' }), on ? 'Ad on' : 'Ad off')) router.refresh()
  }
  const remove = async (cr: Creative) => {
    if (!confirm(`Delete "${cr.name || 'this ad'}"? Its stats stay in the campaign totals.`)) return
    if (toastResult(await deleteCreative(cr.id), 'Deleted')) router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-border bg-card p-4">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Add images or videos</p>
            <p className="text-xs text-muted-foreground">
              {sizes.length ? `Best sizes: ${sizes.join(' · ')}` : 'Pick placements in Settings to see the best sizes.'} Large images are shrunk for you.
            </p>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={!!status}>
            {status ? <Loader2 className="animate-spin" /> : <Upload />}
            {status ?? 'Upload'}
          </Button>
        </div>
      </div>

      {creatives.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
          No ads yet — upload one to start serving this campaign.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {creatives.map((cr) => {
            const t = report?.byCreative[cr.id] ?? ZERO
            return (
              <div key={cr.id} className={`overflow-hidden rounded-xl border border-border bg-card ${cr.status === 'paused' ? 'opacity-70' : ''}`}>
                <button type="button" onClick={() => setPreview(cr)} className="group relative block w-full" aria-label="Preview">
                  <MediaThumb kind={cr.kind} url={cr.media_url} className="aspect-video w-full rounded-none" />
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                </button>
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={cr.name}
                      placeholder="Untitled ad"
                      onBlur={(e) => rename(cr, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-foreground/[0.06] focus:bg-foreground/[0.06]"
                      aria-label="Ad name"
                    />
                    <Switch checked={cr.status === 'active'} onCheckedChange={(on) => toggle(cr, on)} aria-label="Ad on" />
                    <button type="button" onClick={() => remove(cr)} className="rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label="Delete ad">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center tabular-nums">
                    <Mini label="Views" value={num(t.views)} />
                    <Mini label="CTR" value={t.views ? pct(ctr(t)) : '—'} />
                    <Mini label="Watched" value={t.completes + t.skips ? pct(completion(t)) : '—'} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)} role="dialog" aria-label="Preview">
          {preview.kind === 'video' ? (
            <video src={preview.media_url} className="max-h-full max-w-full rounded-lg" controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
            <img src={preview.media_url} alt="" className="max-h-full max-w-full rounded-lg" />
          )}
        </div>
      )}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-foreground/[0.06] px-1 py-1.5">
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
