'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { getUserDetailData } from './actions'
import UserDetailControls from './UserDetailControls'
import StrikeHistory from './StrikeHistory'
import type { Profile, Strike } from '@/lib/types'
import type { StreakDay } from '@/lib/streak'

type Data = {
  profile: Profile
  strikes: (Strike & { issuer: { username: string | null; display_name: string | null } | null })[]
  streakDays: StreakDay[]
}

export default function UserDetailDialog({
  userId,
  name,
  username,
}: {
  userId: string
  name: string
  username: string | null
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = () => getUserDetailData(userId).then((d) => setData(d as unknown as Data))

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Drop the cached snapshot on close so reopening always re-fetches —
      // otherwise a change made during this session (a streak edit, a role
      // change) wouldn't show up until a full page reload.
      setData(null)
      return
    }
    if (next && !data) {
      setLoading(true)
      refetch()
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to load')
          setOpen(false)
        })
        .finally(() => setLoading(false))
    }
  }

  return (
    <>
      <button type="button" onClick={() => handleOpenChange(true)} className="hover:underline text-left">
        <span className="font-medium text-white">{name}</span>
        {username && <span className="text-muted-foreground ml-1.5">@{username}</span>}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle>{name}</DialogTitle>
              <Link
                href={`/admin/users/${userId}`}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
              >
                Open full page
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            {username && <DialogDescription>@{username}</DialogDescription>}
          </DialogHeader>

          {loading || !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <UserDetailControls profile={data.profile} streakDays={data.streakDays} onMutated={refetch} />
              <StrikeHistory strikes={data.strikes} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
