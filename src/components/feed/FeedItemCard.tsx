'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Heart, ShieldCheck, CheckCircle2, XCircle, UserPlus, UserCheck, Clock, Flag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import { toggleLike, toggleFollow, reportAvatar } from '@/app/feed/actions'
import type { FeedItem } from '@/lib/types'

function UserAvatar({ username, avatarUrl }: { username: string | null; avatarUrl: string | null }) {
  return (
    <div className="gradient-ring rounded-full p-[2px] shrink-0">
      <Avatar className="w-8 h-8 ring-1 ring-background">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="bg-secondary text-xs">
          {username?.[0]?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>
    </div>
  )
}

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

  const handleLike = () => {
    const next = !liked
    setLiked(next)
    setLikeCount((c) => c + (next ? 1 : -1))
    startTransition(async () => {
      try {
        await toggleLike(item.id)
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
          <UserAvatar username={item.profiles.display_name ?? item.profiles.username} avatarUrl={item.profiles.avatar_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold truncate">{item.profiles.display_name ?? item.profiles.username ?? 'Someone'}</span>
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
            <p className="text-xs text-muted-foreground">{timeAgo(item.answered_at)}</p>
          </div>
          {!isOwn && (
            <button
              type="button"
              title="Report profile picture"
              onClick={() => setReportOpen(true)}
              className="shrink-0 p-1 -m-1 text-muted-foreground hover:text-destructive transition-colors"
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
            <p className="text-sm text-muted-foreground">{item.challenges.prompt}</p>
            {!item.photo_url && (
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {item.is_correct ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                {item.answer}
              </div>
            )}
          </div>
          {item.photo_url && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions */}
              <img src={item.photo_url} alt="" className="w-full aspect-square object-cover" />
              {item.is_correct === null && (
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold bg-black/60 backdrop-blur-sm text-[color:var(--neon-orange)] px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" />
                  Under review
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            disabled={isPending}
            className={cn(
              'flex items-center gap-1.5 text-sm transition-colors',
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
