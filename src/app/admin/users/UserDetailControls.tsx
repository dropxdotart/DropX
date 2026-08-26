'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AVAILABLE_BADGES } from '@/lib/badges'
import StreakCalendar from '@/components/streak/StreakCalendar'
import {
  updateUserRole,
  updateAccountStatus,
  updateBadges,
  issueStrike,
  toggleStreakDay,
  resetStreakDay,
  extendStreakToToday,
  overrideIdentity,
} from './actions'
import type { Profile, Strike, UserRole, AccountStatus } from '@/lib/types'
import type { StreakDay } from '@/lib/streak'

type StrikeWithIssuer = Strike & { issuer: { username: string | null; display_name: string | null } | null }

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-card">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{children}</p>
}

export default function UserDetailControls({
  profile,
  streakDays,
  strikes,
  onMutated,
}: {
  profile: Profile
  streakDays: StreakDay[]
  strikes: StrikeWithIssuer[]
  // Only set inside the modal (UserDetailDialog) — that view holds its own
  // fetched copy of the data, so a mutation needs to explicitly trigger a
  // re-fetch to show up. The standalone page re-renders on its own (Server
  // Actions + revalidatePath), so it doesn't pass this.
  onMutated?: () => Promise<void>
}) {
  const [role, setRole] = useState<UserRole>(profile.role)
  const [status, setStatus] = useState<AccountStatus>(profile.account_status)
  const [badges, setBadges] = useState<string[]>(profile.badges)
  const [strikeReason, setStrikeReason] = useState('')
  const [newUsername, setNewUsername] = useState(profile.username ?? '')
  const [newDisplayName, setNewDisplayName] = useState(profile.display_name ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const run = (key: string, fn: () => Promise<void>, successMsg: string) => {
    setBusy(key)
    startTransition(async () => {
      try {
        await fn()
        await onMutated?.()
        toast.success(successMsg)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setBusy(null)
      }
    })
  }

  const saveRole = () => {
    if (role === 'admin' && !confirm(`Grant ${profile.username ?? 'this user'} admin access?`)) return
    if (role !== 'admin' && !confirm(`Change ${profile.username ?? 'this user'}'s role to "${role}"?`)) return
    run('role', () => updateUserRole(profile.id, role), 'Role updated')
  }

  const toggleBadge = (badge: string) => {
    setBadges((prev) => (prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]))
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="Profile">
          <div>
            <FieldLabel>Role</FieldLabel>
            <div className="flex gap-2">
              <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="flex-1">
                <option value="user">User</option>
                <option value="mod">Mod</option>
                <option value="admin">Admin</option>
              </Select>
              <Button size="sm" variant="secondary" disabled={busy !== null || role === profile.role} onClick={saveRole}>
                {busy === 'role' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>

          <div>
            <FieldLabel>Account status</FieldLabel>
            <div className="flex gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} className="flex-1">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null || status === profile.account_status}
                onClick={() => run('status', () => updateAccountStatus(profile.id, status), 'Status updated')}
              >
                {busy === 'status' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <FieldLabel>Identity override</FieldLabel>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase())} placeholder="@username" />
              <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Display name" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Bypasses the 48-hour cooldown.</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run('identity', () => overrideIdentity(profile.id, newUsername, newDisplayName), 'Identity updated')}
              >
                {busy === 'identity' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Badges">
            <div className="flex flex-wrap gap-1.5">
              {/* Any value already on the profile that isn't in the fixed list (set
                  before this picker existed) still shows here, so it stays visible
                  and removable instead of silently disappearing on save. */}
              {[...AVAILABLE_BADGES, ...badges.filter((b) => !(AVAILABLE_BADGES as readonly string[]).includes(b))].map((b) => {
                const active = badges.includes(b)
                return (
                  <button key={b} type="button" onClick={() => toggleBadge(b)} className="outline-none">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'cursor-pointer select-none border transition-colors',
                        active
                          ? 'border-[color:var(--neon-violet)]/50 bg-[color:var(--neon-violet)]/15 text-white'
                          : 'border-white/15 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {b}
                    </Badge>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run('badges', () => updateBadges(profile.id, badges), 'Badges saved')}
              >
                {busy === 'badges' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save badges
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Strikes"
            action={strikes.length > 0 ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{strikes.length}</Badge> : undefined}
          >
            <div className="flex gap-2">
              <Textarea
                value={strikeReason}
                onChange={(e) => setStrikeReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={1}
                className="flex-1 resize-none"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() =>
                  run('strike', async () => {
                    await issueStrike(profile.id, strikeReason)
                    setStrikeReason('')
                  }, 'Strike issued')
                }
              >
                {busy === 'strike' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Issue
              </Button>
            </div>

            {strikes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No strikes.</p>
            ) : (
              <div className="max-h-32 space-y-2 overflow-y-auto border-t border-white/10 pt-2">
                {strikes.map((s) => (
                  <div key={s.id} className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                    <p className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()} — by{' '}
                      {s.issuer?.display_name ?? s.issuer?.username ?? 'Someone'}
                    </p>
                    {s.reason && <p>{s.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <Card className="border-white/10 bg-card">
        <CardHeader><CardTitle className="text-sm">Streak</CardTitle></CardHeader>
        <CardContent>
          <StreakCalendar
            currentStreak={profile.current_streak}
            longestStreak={profile.longest_streak}
            days={streakDays}
            onExtendToToday={async () => {
              await extendStreakToToday(profile.id)
              await onMutated?.()
            }}
            onToggleDay={async (date, counts) => {
              await toggleStreakDay(profile.id, date, counts)
              await onMutated?.()
            }}
            onResetDay={async (date) => {
              await resetStreakDay(profile.id, date)
              await onMutated?.()
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
