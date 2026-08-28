'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'

export type SwipeDecision = 'left' | 'right'

type DecisionResult = { alreadyHandled: boolean } | void

type Props<T extends { id: string }> = {
  items: T[]
  // The mutation for a decision — return { alreadyHandled: true } when the
  // guarded server-side update found the item already resolved (another
  // mod got there first, see mod/actions.ts's race-safe pattern), so this
  // card just moves on instead of erroring. Any queue built on this shares
  // one live pool across every mod working it at once — nothing here
  // reserves a card to a single reviewer.
  onDecision: (item: T, decision: SwipeDecision) => Promise<DecisionResult>
  renderCard: (item: T) => React.ReactNode
  leftLabel: string
  rightLabel: string
  leftIcon: React.ReactNode
  rightIcon: React.ReactNode
  emptyState?: React.ReactNode
}

const EXIT_DISTANCE = 700
const SWIPE_THRESHOLD = 110
const ROTATE_DIVISOR = 18

export default function SwipeStack<T extends { id: string }>({
  items,
  onDecision,
  renderCard,
  leftLabel,
  rightLabel,
  leftIcon,
  rightIcon,
  emptyState,
}: Props<T>) {
  const [queue, setQueue] = useState(items)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState<SwipeDecision | null>(null)
  const startX = useRef(0)
  const pointerId = useRef<number | null>(null)

  const top = queue[0]
  const next = queue[1]

  const finish = () => {
    setQueue((q) => q.slice(1))
    setDragX(0)
    setExiting(null)
  }

  const commit = (decision: SwipeDecision) => {
    if (!top || exiting) return
    setExiting(decision)
    setDragX(decision === 'right' ? EXIT_DISTANCE : -EXIT_DISTANCE)

    onDecision(top, decision)
      .then((result) => {
        if (result?.alreadyHandled) toast('Already handled by another mod')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      })

    window.setTimeout(finish, 240)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointerId.current = e.pointerId
    startX.current = e.clientX - dragX
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || pointerId.current !== e.pointerId) return
    setDragX(e.clientX - startX.current)
  }

  const endDrag = () => {
    if (!dragging) return
    setDragging(false)
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      commit(dragX > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }
  }

  if (!top) {
    return (
      emptyState ?? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 gap-3 text-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground" />
          <p className="text-muted-foreground">Nothing pending — you&apos;re caught up.</p>
        </div>
      )
    )
  }

  const rotate = dragX / ROTATE_DIVISOR
  const opacity = exiting ? 0 : Math.max(0, 1 - Math.abs(dragX) / (EXIT_DISTANCE * 0.9))

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-full max-w-sm" style={{ height: 420 }}>
        {next && (
          <div
            className="absolute inset-0 rounded-2xl border border-border bg-card scale-[0.96] translate-y-2 opacity-70"
            aria-hidden
          >
            {renderCard(next)}
          </div>
        )}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cn(
            'absolute inset-0 rounded-2xl border border-border bg-card overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing',
            !dragging && 'transition-transform duration-200 ease-out'
          )}
          style={{ transform: `translateX(${dragX}px) rotate(${rotate}deg)`, opacity }}
        >
          {renderCard(top)}

          {/* Decision stamps — fade in as the card crosses the threshold,
              so the direction reads clearly mid-drag, not just on release. */}
          <div
            className="absolute top-4 left-4 px-3 py-1 rounded-lg border-2 border-destructive text-destructive font-bold text-sm uppercase tracking-wide -rotate-12 pointer-events-none"
            style={{ opacity: dragX < 0 ? Math.min(1, -dragX / SWIPE_THRESHOLD) : 0 }}
          >
            {leftLabel}
          </div>
          <div
            className="absolute top-4 right-4 px-3 py-1 rounded-lg border-2 border-[color:var(--positive)] text-[color:var(--positive)] font-bold text-sm uppercase tracking-wide rotate-12 pointer-events-none"
            style={{ opacity: dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0 }}
          >
            {rightLabel}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <button
          type="button"
          disabled={Boolean(exiting)}
          onClick={() => commit('left')}
          className="h-12 rounded-xl font-semibold flex items-center justify-center gap-1.5 bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-colors"
        >
          {leftIcon}
          {leftLabel}
        </button>
        <button
          type="button"
          disabled={Boolean(exiting)}
          onClick={() => commit('right')}
          className="h-12 rounded-xl font-semibold flex items-center justify-center gap-1.5 bg-[color:var(--positive)]/15 text-[color:var(--positive)] hover:bg-[color:var(--positive)]/25 disabled:opacity-50 transition-colors"
        >
          {rightIcon}
          {rightLabel}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{queue.length} left · drag the card or use the buttons</p>
    </div>
  )
}
