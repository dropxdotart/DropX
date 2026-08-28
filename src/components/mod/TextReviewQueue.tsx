'use client'

import { Check, X } from 'lucide-react'
import { reviewTextAnswer } from '@/app/mod/actions'
import SwipeStack, { type SwipeDecision } from './SwipeStack'
import type { TextReviewItem } from '@/lib/types'

function TextCard({ item }: { item: TextReviewItem }) {
  return (
    <div className="flex flex-col h-full p-5 justify-center gap-4">
      <p className="text-xs text-muted-foreground text-center">{item.challenges.prompt}</p>
      <p className="text-xl font-semibold text-center leading-snug break-words">&ldquo;{item.answer}&rdquo;</p>
      <p className="text-sm text-muted-foreground text-center mt-2">
        {item.profiles?.display_name ?? item.profiles?.username ?? 'Someone'}
      </p>
    </div>
  )
}

export default function TextReviewQueue({ initialItems }: { initialItems: TextReviewItem[] }) {
  const handleDecision = async (item: TextReviewItem, decision: SwipeDecision) => {
    return reviewTextAnswer(item.id, decision === 'right')
  }

  return (
    <SwipeStack
      items={initialItems}
      onDecision={handleDecision}
      renderCard={(item) => <TextCard item={item} />}
      leftLabel="Wrong"
      rightLabel="Correct"
      leftIcon={<X className="w-4 h-4" />}
      rightIcon={<Check className="w-4 h-4" />}
      emptyState={
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 gap-3 text-center">
          <p className="text-muted-foreground">No answers waiting on a close call.</p>
        </div>
      }
    />
  )
}
