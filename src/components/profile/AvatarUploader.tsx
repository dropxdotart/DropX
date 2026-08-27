'use client'

import { useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Camera, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { updateAvatarUrl, removeAvatar } from '@/app/profile/actions'

export default function AvatarUploader({
  userId,
  initialAvatarUrl,
  fallbackLetter,
}: {
  userId: string
  initialAvatarUrl: string | null
  fallbackLetter: string
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust — the path is fixed per user, so without this the browser
      // (and anyone else's cached copy) would keep showing the old image.
      const freshUrl = `${publicUrl}?t=${Date.now()}`
      await updateAvatarUrl(freshUrl)
      setAvatarUrl(freshUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await removeAvatar()
      setAvatarUrl(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="relative glow-violet rounded-full shrink-0">
        <Sparkles className="absolute -top-2.5 -left-3 w-4 h-4 text-[color:var(--neon-pink)]" fill="currentColor" />
        <Sparkles className="absolute top-1 -right-3 w-2.5 h-2.5 text-[color:var(--neon-orange)]" fill="currentColor" />
        <Sparkles className="absolute -bottom-2 -right-2 w-3.5 h-3.5 text-[color:var(--neon-cyan)]" fill="currentColor" />
        <Sparkles className="absolute -bottom-1 left-0 w-2 h-2 text-[color:var(--neon-violet)]" fill="currentColor" />
        <div className="gradient-ring rounded-full p-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="group relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Avatar className="w-24 h-24 ring-2 ring-background">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
              <AvatarFallback className="text-3xl bg-secondary">{fallbackLetter}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              {busy ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
            </div>
          </button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} disabled={busy} />
      {avatarUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="block mx-auto text-[11px] text-muted-foreground hover:text-destructive transition-colors"
        >
          Remove photo
        </button>
      )}
    </div>
  )
}
