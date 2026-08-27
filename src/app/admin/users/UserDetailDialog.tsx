'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, Flame } from 'lucide-react'
import { toast } from 'sonner'
import { getUserDetailData } from './actions'
import UserDetailControls from './UserDetailControls'
import { RoleBadge, StatusBadge, UserAvatar } from './UserBadges'
import type { Profile, Strike, AdminAction, AvatarPreset, UserRole, AccountStatus } from '@/lib/types'
import type { StreakDay } from '@/lib/streak'

type Data = {
  profile: Profile
  strikes: (Strike & {
    issuer: { username: string | null; display_name: string | null } | null
    revoker: { username: string | null; display_name: string | null } | null
  })[]
  streakDays: StreakDay[]
  actions: (AdminAction & { actor: { username: string | null; display_name: string | null } | null })[]
  presets: AvatarPreset[]
}

export default function UserDetailDialog({
  userId,
  name,
  username,
  role,
  badges,
  accountStatus,
  joined,
}: {
  userId: string
  name: string
  username: string | null
  role: UserRole
  badges: string[]
  accountStatus: AccountStatus
  joined: string
}) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = () => getUserDetailData(userId).then((d) => setData(d as unknown as Data))

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
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
      <tr
        onClick={() => handleOpenChange(true)}
        className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer"
      >
        <td className="p-2.5">
          <span className="font-medium text-white">{name}</span>
          {username && <span className="text-muted-foreground ml-1.5">@{username}</span>}
        </td>
        <td className="p-2.5">
          <RoleBadge role={role} />
        </td>
        <td className="p-2.5">
          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-[220px]">
              {badges.slice(0, 3).map((b) => (
                <Badge key={b} variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">{b}</Badge>
              ))}
              {badges.length > 3 && (
                <span className="text-[10px] text-muted-foreground self-center">+{badges.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="p-2.5">
          <StatusBadge status={accountStatus} />
        </td>
        <td className="p-2.5 text-muted-foreground whitespace-nowrap">{joined}</td>
      </tr>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <Link
            href={`/admin/users/${userId}`}
            title="Open full page"
            className="absolute top-2 right-10 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>

          <DialogHeader className="flex-row items-start gap-3">
            <UserAvatar name={name} role={role} avatarUrl={data?.profile.avatar_url} />
            <div className="min-w-0 flex-1 space-y-0.5 pr-16">
              <div className="flex flex-wrap items-center gap-1.5">
                <DialogTitle className="text-lg">{name}</DialogTitle>
                <RoleBadge role={role} />
                {accountStatus !== 'active' && <StatusBadge status={accountStatus} />}
              </div>
              {username && <DialogDescription>@{username}</DialogDescription>}
              <p className="text-xs text-muted-foreground pt-0.5">
                Joined {joined}
                {data && (
                  <>
                    {' · '}
                    {data.profile.last_answered_date
                      ? `Last answered ${new Date(data.profile.last_answered_date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : 'Never answered'}
                    {data.profile.current_streak > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5">
                        <Flame className="w-3 h-3 text-[color:var(--neon-orange)]" fill="currentColor" />
                        {data.profile.current_streak}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </DialogHeader>

          {loading || !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <UserDetailControls
              profile={data.profile}
              streakDays={data.streakDays}
              strikes={data.strikes}
              actions={data.actions}
              presets={data.presets}
              onMutated={refetch}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
