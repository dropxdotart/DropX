'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Heart, ShieldCheck, Star, UserPlus, UserCheck, Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import { toggleLike, toggleFollow, reportAvatar } from '@/app/feed/actions'
import UserAvatar from '@/components/shared/UserAvatar'
import type { FeedItem } from '@/lib/types'

export default function FeedItemCard({ item, currentUserId }: { item: FeedItem; currentUserId: string }) {
  const [liked, setLiked] = useState(item.likedByMe)
  const [likeCount, setLikeCount] = useState(item.likeCount)
  const [following, setFollowing] = useState(item.authorFollowedByMe)
  const [isPending, startTransition] = useTransition()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)

  const isOwn = item.user_id === currentUserId

  const handleReport = () => {
    if (reporting) return
    setReporting(true)
    startTransition(async () => {
      try {
        await reportAvatar(item.user_id, item.profiles.avatar_url, reportReason)
        toast.success('Reported — a mod will take a look')
        setReportOpen(false)
        setReportReason('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setReporting(false)
      }
    })
  }

  const targetType = item.kind === 'caption' ? 'caption_response' : 'dare_submission'

  const handleLike = () => {
    const next = !liked
    setLiked(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    startTransition(async () => {
      try {
        await toggleLike(targetType, item.id)
      } catch (err) {
        setLiked(!next)
        setLikeCount((c) => c + (next ? -1 : 1))
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  const handleFollow = () => {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      try {
        await toggleFollow(item.user_id)
      } catch (err) {
        setFollowing(!next)
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2.5">
          {item.profiles.username ? (
            <Link href={`/u/${item.profiles.username}`} className="shrink-0">
              <UserAvatar username={item.profiles.display_name ?? item.profiles.username} avatarUrl={item.profiles.avatar_url} />
            </Link>
          ) : (
            <UserAvatar username={item.profiles.display_name ?? item.profiles.username} avatarUrl={item.profiles.avatar_url} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.profiles.username ? (
                <Link href={`/u/${item.profiles.username}`} className="text-sm font-semibold truncate hover:underline">
                  {item.profiles.display_name ?? item.profiles.username}
                </Link>
              ) : (
                <span className="text-sm font-semibold truncate">{item.profiles.display_name ?? 'Someone'}</span>
              )}
              {item.profiles.username && (
                <span className="text-xs text-muted-foreground truncate">@{item.profiles.username}</span>
              )}
              {item.profiles.role !== 'user' && (
                <Badge className="gap-0.5 border-0 gradient-hero text-white text-[10px] px-1.5 py-0 capitalize">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {item.profiles.role}
                </Badge>
              )}
              {item.profiles.badges?.map((badge) => (
                <Badge key={badge} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {badge}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{timeAgo(item.submitted_at)}</p>
          </div>
          {!isOwn && (
            <button
              type="button"
              title="Report profile picture"
              onClick={() => setReportOpen(true)}
              className="shrink-0 p-2 -m-2 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
          {!isOwn && (
            <Button
              size="sm"
              variant={following ? 'secondary' : 'outline'}
              className="h-7 px-2 text-xs shrink-0"
              onClick={handleFollow}
              disabled={isPending}
            >
              {following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {following ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>

        <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
          <div className="p-3 space-y-1.5">
            <p className="text-sm text-muted-foreground">{item.prompt}</p>
            {item.kind === 'caption' && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">&ldquo;{item.caption}&rdquo;</p>
                {item.rating !== null && (
                  <span className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-[color:var(--neon-orange)]">
                    <Star className="w-3.5 h-3.5" fill="currentColor" />
                    {item.rating}
                  </span>
                )}
              </div>
            )}
          </div>
          {item.kind === 'caption' && item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions
            <img src={item.imageUrl} alt="" className="w-full aspect-square object-cover" />
          )}
          {item.kind === 'dare' && item.videoUrl && (
            <video src={item.videoUrl} className="w-full aspect-square object-cover bg-black" controls playsInline />
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1.5 text-sm transition-colors p-2 -m-2',
              liked ? 'text-[color:var(--neon-pink)]' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
            {likeCount > 0 && likeCount}
          </button>
        </div>
      </CardContent>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Report profile picture</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Why are you reporting this? (optional)"
              rows={2}
              disabled={reporting}
            />
            <Button variant="destructive" className="w-full" disabled={reporting} onClick={handleReport}>
              {reporting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Submit report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
