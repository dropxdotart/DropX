'use client'

import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { approvePhoto, rejectPhoto } from '@/app/mod/actions'
import SwipeStack, { type SwipeDecision } from './SwipeStack'
import type { ModQueueItem } from '@/lib/types'

function useCountdown(answeredAt: string, graceMinutes: number) {
  const graceMs = graceMinutes * 60 * 1000
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(answeredAt).getTime() + graceMs - Date.now()))
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(answeredAt).getTime() + graceMs - Date.now()))
    }, 1000)
    return () => clearInterval(id)
  }, [answeredAt, graceMs])
  const totalSec = Math.floor(remaining / 1000)
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`
}

function PhotoCard({ item, graceMinutes }: { item: ModQueueItem; graceMinutes: number }) {
  const countdown = useCountdown(item.answered_at, graceMinutes)
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions */}
        <img src={item.photo_url} alt="Submission" className="w-full h-full object-cover" draggable={false} />
        <span className="absolute top-2 right-2 text-[11px] font-semibold bg-black/60 backdrop-blur-sm text-[color:var(--neon-orange)] px-2 py-1 rounded-full tabular-nums">
          {countdown}
        </span>
      </div>
      <div className="p-3 shrink-0">
        <p className="text-sm font-semibold">{item.profiles?.display_name ?? item.profiles?.username ?? 'Someone'}</p>
        <p className="text-xs text-muted-foreground truncate">{item.challenges.prompt}</p>
      </div>
    </div>
  )
}

export default function ModQueue({ initialItems, graceMinutes }: { initialItems: ModQueueItem[]; graceMinutes: number }) {
  const handleDecision = async (item: ModQueueItem, decision: SwipeDecision) => {
    const result = decision === 'right' ? await approvePhoto(item.id) : await rejectPhoto(item.id)
    return result
  }

  return (
    <SwipeStack
      items={initialItems}
      onDecision={handleDecision}
      renderCard={(item) => <PhotoCard item={item} graceMinutes={graceMinutes} />}
      leftLabel="Reject"
      rightLabel="Approve"
      leftIcon={<X className="w-4 h-4" />}
      rightIcon={<Check className="w-4 h-4" />}
    />
  )
}
