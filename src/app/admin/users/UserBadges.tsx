import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UserRole, AccountStatus } from '@/lib/types'

const ROLE_TINT: Record<UserRole, string> = {
  admin: 'border-[color:var(--neon-violet)]/40 text-[color:var(--neon-violet)]',
  mod: 'border-[color:var(--neon-cyan)]/40 text-[color:var(--neon-cyan)]',
  user: 'border-white/15 text-muted-foreground',
}

const ROLE_AVATAR_TINT: Record<UserRole, string> = {
  admin: 'bg-[color:var(--neon-violet)]/15 border-[color:var(--neon-violet)]/40 text-[color:var(--neon-violet)]',
  mod: 'bg-[color:var(--neon-cyan)]/15 border-[color:var(--neon-cyan)]/40 text-[color:var(--neon-cyan)]',
  user: 'bg-white/5 border-white/15 text-muted-foreground',
}

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn('capitalize text-[10px] px-1.5 py-0', ROLE_TINT[role], className)}>
      {role}
    </Badge>
  )
}

export function StatusBadge({ status, className }: { status: AccountStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize text-[10px] px-1.5 py-0',
        status !== 'active' ? 'border-destructive/40 text-destructive' : 'border-white/15 text-muted-foreground',
        className
      )}
    >
      {status}
    </Badge>
  )
}

export function UserAvatar({
  name,
  role,
  avatarUrl,
  className,
}: {
  name: string
  role: UserRole
  avatarUrl?: string | null
  className?: string
}) {
  return (
    <div
      className={cn(
        'w-12 h-12 rounded-full border flex items-center justify-center text-lg font-bold shrink-0 overflow-hidden',
        ROLE_AVATAR_TINT[role],
        className
      )}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        name.trim().charAt(0).toUpperCase() || '?'
      )}
    </div>
  )
}
