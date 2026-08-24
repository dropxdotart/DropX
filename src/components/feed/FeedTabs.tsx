'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import FeedItemCard from './FeedItemCard'
import { Rss } from 'lucide-react'
import type { FeedItem } from '@/lib/types'

export default function FeedTabs({
  items,
  currentUserId,
  showEveryoneTab,
}: {
  items: FeedItem[]
  currentUserId: string
  showEveryoneTab: boolean
}) {
  const [tab, setTab] = useState<'friends' | 'everyone'>('friends')

  const friendsItems = items.filter((i) => i.user_id === currentUserId || i.authorFollowedByMe)
  const visibleItems = showEveryoneTab && tab === 'everyone' ? items : friendsItems

  return (
    <div className="w-full max-w-sm space-y-4">
      {showEveryoneTab && (
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          {(['friends', 'everyone'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-sm font-medium capitalize transition-colors',
                tab === t ? 'gradient-hero text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 gap-3 text-center">
          <Rss className="w-8 h-8 text-muted-foreground" />
          <p className="text-muted-foreground max-w-xs">
            {tab === 'friends'
              ? "Nobody you follow has answered yet — follow people from Everyone, or check back later."
              : "Nothing here yet — answer today's challenge to start seeing how everyone else did."}
          </p>
        </div>
      ) : (
        visibleItems.map((item) => (
          <FeedItemCard key={item.id} item={item} currentUserId={currentUserId} />
        ))
      )}
    </div>
  )
}
