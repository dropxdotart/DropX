'use client'

import { Check, X } from 'lucide-react'
import { approveDare, rejectDare } from '@/app/mod/actions'
import SwipeStack, { type SwipeDecision } from './SwipeStack'
import type { DareQueueItem } from '@/lib/types'

function DareCard({ item }: { item: DareQueueItem }) {
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-0 bg-black">
        <video src={item.video_url} className="w-full h-full object-cover" controls playsInline />
      </div>
      <div className="p-3 shrink-0">
        <p className="text-sm font-semibold">{item.profiles?.display_name ?? item.profiles?.username ?? 'Someone'}</p>
        <p className="text-xs text-muted-foreground truncate">{item.drops.prompt}</p>
        {item.counted_reps !== null && (
          <p className="text-xs text-muted-foreground">Claimed {item.counted_reps} reps</p>
        )}
      </div>
    </div>
  )
}

export default function DareReviewQueue({ initialItems }: { initialItems: DareQueueItem[] }) {
  const handleDecision = async (item: DareQueueItem, decision: SwipeDecision) => {
    return decision === 'right' ? approveDare(item.id) : rejectDare(item.id)
  }

  return (
    <SwipeStack
      items={initialItems}
      onDecision={handleDecision}
      renderCard={(item) => <DareCard item={item} />}
      leftLabel="Reject"
      rightLabel="Approve"
      leftIcon={<X className="w-4 h-4" />}
      rightIcon={<Check className="w-4 h-4" />}
    />
  )
}
