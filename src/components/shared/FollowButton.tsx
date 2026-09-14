'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toggleFollow } from '@/app/feed/actions'

export default function FollowButton({
  targetUserId,
  initialFollowing,
  className,
}: {
  targetUserId: string
  initialFollowing: boolean
  className?: string
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      try {
        await toggleFollow(targetUserId)
      } catch (err) {
        setFollowing(!next)
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Button
      variant={following ? 'secondary' : 'default'}
      className={cn(!following && 'glow-violet', className)}
      disabled={isPending}
      onClick={handleClick}
    >
      {following ? <UserCheck className="w-4 h-4 mr-1.5" /> : <UserPlus className="w-4 h-4 mr-1.5" />}
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
