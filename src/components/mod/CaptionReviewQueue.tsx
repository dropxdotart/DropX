'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { rateCaption, removeCaption } from '@/app/mod/actions'
import type { CaptionReviewItem } from '@/lib/types'

// Same card-stack look as SwipeStack (single top card, a next card peeking
// behind), but the decision here is a 1-10 rating, not a binary swipe, so
// this is its own small component rather than a SwipeStack variant.
function CaptionCard({ item }: { item: CaptionReviewItem }) {
  return (
    <div className="flex flex-col">
      {item.challenges.prompt_image_url && (
        // Capped, not filling the card — the rating grid below needs to
        // stay on-screen without scrolling for this queue to work as fast
        // one-handed triage, so this can't grow the way the photo queue's
        // hero image does.
        <div className="w-full h-40 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL */}
          <img src={item.challenges.prompt_image_url} alt="" className="w-full h-full object-cover" draggable={false} />
        </div>
      )}
      <div className="p-4 space-y-1.5">
        <p className="text-xs text-muted-foreground">{item.challenges.prompt}</p>
        <p className="text-lg font-semibold leading-snug break-words">&ldquo;{item.answer}&rdquo;</p>
        <p className="text-xs text-muted-foreground">{item.profiles?.display_name ?? item.profiles?.username ?? 'Someone'}</p>
      </div>
    </div>
  )
}

export default function CaptionReviewQueue({ initialItems }: { initialItems: CaptionReviewItem[] }) {
  const [queue, setQueue] = useState(initialItems)
  const [busy, setBusy] = useState(false)
  const top = queue[0]

  const advance = () => setQueue((q) => q.slice(1))

  const handleRate = async (rating: number) => {
    if (!top || busy) return
    setBusy(true)
    try {
      const result = await rateCaption(top.id, rating)
      if (result.alreadyHandled) toast('Already handled by another mod')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      advance()
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!top || busy) return
    if (!confirm("Remove this caption? It won't count and won't be visible.")) return
    setBusy(true)
    try {
      const result = await removeCaption(top.id)
      if (result.alreadyHandled) toast('Already handled by another mod')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      advance()
      setBusy(false)
    }
  }

  if (!top) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 gap-3 text-center">
        <p className="text-muted-foreground">Nothing pending — you&apos;re caught up.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card overflow-hidden">
        <CaptionCard item={top} />
      </div>

      <div className="w-full max-w-sm space-y-2">
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => handleRate(n)}
              className="h-10 rounded-lg font-semibold text-sm bg-muted hover:bg-[color:var(--positive)]/20 hover:text-[color:var(--positive)] disabled:opacity-50 transition-colors tabular-nums"
            >
              {n}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleRemove}
          className="w-full h-10 rounded-lg font-medium text-sm flex items-center justify-center gap-1.5 bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{queue.length} left · tap a rating 1–10, or remove</p>
    </div>
  )
}
