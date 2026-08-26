'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { Profile, UserRole, AccountStatus } from '@/lib/types'
import type { StreakDay } from '@/lib/streak'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-card">
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

export default function UserDetailControls({ profile, streakDays }: { profile: Profile; streakDays: StreakDay[] }) {
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
      <p className="text-xs text-muted-foreground">
        Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        {' · '}
        {profile.last_answered_date
          ? `Last answered ${new Date(profile.last_answered_date + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'Never answered'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="user">User</option>
            <option value="mod">Mod</option>
            <option value="admin">Admin</option>
          </Select>
          <Button size="sm" variant="secondary" disabled={busy !== null || role === profile.role} onClick={saveRole}>
            {busy === 'role' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save role
          </Button>
        </SectionCard>

        <SectionCard title="Account status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
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
            Save status
          </Button>
        </SectionCard>

        <SectionCard title="Badges">
          <div className="flex flex-wrap gap-1.5">
            {/* Any value already on the profile that isn't in the fixed list (set
                before this picker existed) still shows here, so it stays visible
                and removable instead of silently disappearing on save. */}
            {[...AVAILABLE_BADGES, ...badges.filter((b) => !(AVAILABLE_BADGES as readonly string[]).includes(b))].map((b) => {
              const active = badges.includes(b)
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBadge(b)}
                  className="outline-none"
                >
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
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run('badges', () => updateBadges(profile.id, badges), 'Badges saved')}
          >
            {busy === 'badges' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save badges
          </Button>
        </SectionCard>

        <SectionCard title="Issue a strike">
          <Textarea
            value={strikeReason}
            onChange={(e) => setStrikeReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
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
            Issue strike
          </Button>
        </SectionCard>

        <SectionCard title="Identity override">
          <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase())} placeholder="@username" />
          <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Display name" />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              run(
                'identity',
                () => overrideIdentity(profile.id, newUsername, newDisplayName),
                'Identity updated'
              )
            }
          >
            {busy === 'identity' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save identity
          </Button>
          <p className="text-xs text-muted-foreground">Bypasses the normal 48-hour display name cooldown.</p>
        </SectionCard>
      </div>

      <Card className="border-white/10 bg-card">
        <CardHeader><CardTitle className="text-sm">Streak</CardTitle></CardHeader>
        <CardContent>
          <StreakCalendar
            currentStreak={profile.current_streak}
            longestStreak={profile.longest_streak}
            days={streakDays}
            onExtendToToday={() => extendStreakToToday(profile.id)}
            onToggleDay={(date, counts) => toggleStreakDay(profile.id, date, counts)}
            onResetDay={(date) => resetStreakDay(profile.id, date)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
