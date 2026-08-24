'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, X, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { approvePhoto, rejectPhoto } from '@/app/mod/actions'
import type { ModQueueItem } from '@/lib/types'

const GRACE_MS = 10 * 60 * 1000

function useCountdown(answeredAt: string) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(answeredAt).getTime() + GRACE_MS - Date.now()))
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(answeredAt).getTime() + GRACE_MS - Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [answeredAt])
  const totalSec = Math.floor(remaining / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}

function QueueCard({ item, onHandled }: { item: ModQueueItem; onHandled: (id: string) => void }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const countdown = useCountdown(item.answered_at)

  const handle = async (approve: boolean) => {
    if (busy) return
    setBusy(approve ? 'approve' : 'reject')
    try {
      const result = approve ? await approvePhoto(item.id) : await rejectPhoto(item.id)
      if (result.alreadyHandled) toast('Someone already reviewed this one')
      onHandled(item.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions */}
        <img src={item.photo_url} alt="Submission" className="w-full aspect-square object-cover" />
        <span className="absolute top-2 right-2 text-[11px] font-semibold bg-black/60 backdrop-blur-sm text-[color:var(--neon-orange)] px-2 py-1 rounded-full tabular-nums">
          {countdown}
        </span>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <p className="text-sm font-semibold">{item.profiles?.username ?? 'Someone'}</p>
          <p className="text-xs text-muted-foreground truncate">{item.challenges.prompt}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            className="h-12 rounded-xl text-lg font-bold bg-destructive/15 text-destructive hover:bg-destructive/25 border-0 glow-pink"
            disabled={busy !== null}
            onClick={() => handle(false)}
          >
            <X className="w-5 h-5" />
            N
          </Button>
          <Button
            className="h-12 rounded-xl text-lg font-bold bg-green-500/15 text-green-400 hover:bg-green-500/25 border-0 glow-green"
            disabled={busy !== null}
            onClick={() => handle(true)}
          >
            <Check className="w-5 h-5" />
            Y
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ModQueue({ initialItems }: { initialItems: ModQueueItem[] }) {
  const [items, setItems] = useState(initialItems)

  const handleHandled = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 gap-3 text-center">
        <ShieldCheck className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground">Nothing pending — you&apos;re caught up.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <QueueCard key={item.id} item={item} onHandled={handleHandled} />
      ))}
    </div>
  )
}
