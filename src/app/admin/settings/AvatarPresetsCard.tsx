'use client'

import { useRef, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { uploadAvatarPreset, setAvatarPresetActive, deleteAvatarPreset } from './actions'
import type { AvatarPreset } from '@/lib/types'

export default function AvatarPresetsCard({ initial }: { initial: AvatarPreset[] }) {
  const [presets, setPresets] = useState(initial)
  const [label, setLabel] = useState('')
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
    formData.set('label', label)
    startTransition(async () => {
      try {
        await uploadAvatarPreset(formData)
        toast.success('Preset added')
        setLabel('')
        setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        // No id/url comes back from the action — a refetch would need a
        // server round trip, and this list is short-lived per admin
        // session, so a full reload keeps it simple and always correct.
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
        await setAvatarPresetActive(id, active)
        setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  const handleDelete = (id: string) => {
    if (!confirm('Remove this preset? Anyone currently using it keeps it, but it disappears from the picker.')) return
    setBusyId(id)
    startTransition(async () => {
      try {
        await deleteAvatarPreset(id)
        setPresets((prev) => prev.filter((p) => p.id !== id))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <Card className="border-border bg-card max-w-md">
      <CardHeader><CardTitle className="text-base">Avatar presets</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {presets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No presets yet.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2.5">
            {presets.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL */}
                <img
                  src={p.image_url}
                  alt={p.label ?? ''}
                  className={cn('w-full aspect-square rounded-lg object-cover border', p.active ? 'border-border' : 'border-border opacity-40')}
                />
                <button
                  type="button"
                  title="Remove"
                  disabled={busyId === p.id}
                  onClick={() => handleDelete(p.id)}
                  className="absolute -top-2 -right-2 size-7 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                >
                  {busyId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(p.id, !p.active)}
                  disabled={busyId === p.id}
                  className="mt-1 w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p.active ? 'Active' : 'Hidden'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <div className="flex gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              disabled={uploading}
              className="flex-1"
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {fileName ? 'Change image' : 'Choose image'}
            </Button>
          </div>
          {fileName && <p className="text-[11px] text-muted-foreground truncate">{fileName}</p>}
          <Button size="sm" variant="secondary" disabled={uploading || !fileName} onClick={handleUpload} className="w-full">
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Add preset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
