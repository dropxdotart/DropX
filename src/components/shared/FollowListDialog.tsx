'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import UserAvatar from '@/components/shared/UserAvatar'
import { getFollowers, getFollowing, type FollowListEntry } from '@/app/feed/actions'

// The tappable follower/following count that opens the actual list — one
// component for both directions and both surfaces (own profile, public
// profile) since the only difference is which action fetches the rows.
// Fetches lazily on first open, not on page load, since most visits never
// open it.
export default function FollowListDialog({
  userId,
  kind,
  count,
  label,
}: {
  userId: string
  kind: 'followers' | 'following'
  count: number
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<FollowListEntry[] | null>(null)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && entries === null) {
      setLoading(true)
      const fetcher = kind === 'followers' ? getFollowers : getFollowing
      fetcher(userId)
        .then(setEntries)
        .catch(() => setEntries([]))
        .finally(() => setLoading(false))
    }
  }

  return (
    <>
      <button type="button" onClick={() => handleOpenChange(true)} className="text-center px-3 py-1 -my-1 rounded-lg hover:bg-white/5 transition-colors">
        <p className="text-lg font-bold tabular-nums">{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !entries || entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nobody here yet.</p>
          ) : (
            <div className="space-y-0.5">
              {entries.map((e) => (
                <Link
                  key={e.id}
                  href={e.username ? `/u/${e.username}` : '#'}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 p-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <UserAvatar username={e.display_name ?? e.username} avatarUrl={e.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.display_name ?? e.username ?? 'Someone'}</p>
                    {e.username && <p className="text-xs text-muted-foreground truncate">@{e.username}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
