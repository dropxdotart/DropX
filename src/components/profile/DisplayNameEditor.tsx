'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setDisplayName } from '@/app/profile/actions'

const COOLDOWN_MS = 48 * 60 * 60 * 1000

export default function DisplayNameEditor({
  initialName,
  username,
  changedAt,
}: {
  initialName: string
  username: string | null
  changedAt: string | null
}) {
  const [name, setName] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialName)
  const [isPending, startTransition] = useTransition()

  const nextAvailable = changedAt ? new Date(changedAt).getTime() + COOLDOWN_MS : 0
  const onCooldown = nextAvailable > Date.now()

  const handleSave = () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      setDraft(name)
      return
    }
    startTransition(async () => {
      try {
        await setDisplayName(trimmed)
        setName(trimmed)
        setEditing(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={30}
          disabled={isPending}
          className="h-8 rounded-lg border-white/10 bg-white/5 text-sm w-40"
        />
        <Button size="icon-sm" className="rounded-lg glow-violet" disabled={isPending} onClick={handleSave}>
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setDraft(name)
            setEditing(false)
          }}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xl font-bold truncate">{name}</span>
        {onCooldown ? (
          <span title={`You can change this again on ${new Date(nextAvailable).toLocaleString()}`}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground/40" />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {username && <p className="text-sm text-muted-foreground">@{username}</p>}
    </div>
  )
}
