import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// The gradient-ring avatar treatment used anywhere a user shows up in a
// list — feed cards, profile headers, follower/following lists. Pulled out
// of FeedItemCard so it's one definition, not a copy per surface.
export default function UserAvatar({
  username,
  avatarUrl,
  size = 'md',
}: {
  username: string | null
  avatarUrl: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-14 h-14' : 'w-8 h-8'
  return (
    <div className="gradient-ring rounded-full p-[2px] shrink-0">
      <Avatar className={cn(dims, 'ring-1 ring-background')}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="bg-secondary text-xs">
          {username?.[0]?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>
    </div>
  )
}
