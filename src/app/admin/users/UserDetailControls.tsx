'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateUserRole,
  updateAccountStatus,
  updateBadges,
  issueStrike,
  adjustUserStreak,
  overrideIdentity,
} from './actions'
import type { Profile, UserRole, AccountStatus } from '@/lib/types'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-white/10 bg-card/60">
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

export default function UserDetailControls({ profile }: { profile: Profile }) {
  const [role, setRole] = useState<UserRole>(profile.role)
  const [status, setStatus] = useState<AccountStatus>(profile.account_status)
  const [badges, setBadges] = useState<string[]>(profile.badges)
  const [newBadge, setNewBadge] = useState('')
  const [strikeReason, setStrikeReason] = useState('')
  const [streak, setStreak] = useState(String(profile.current_streak))
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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SectionCard title="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="user">User</option>
          <option value="mod">Mod</option>
          <option value="admin">Admin</option>
        </Select>
        <Button
          size="sm"
          disabled={busy !== null || role === profile.role}
          onClick={() => run('role', () => updateUserRole(profile.id, role), 'Role updated')}
        >
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
          disabled={busy !== null || status === profile.account_status}
          onClick={() => run('status', () => updateAccountStatus(profile.id, status), 'Status updated')}
        >
          {busy === 'status' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Save status
        </Button>
      </SectionCard>

      <SectionCard title="Badges">
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <Badge key={b} variant="secondary" className="gap-1 pr-1">
              {b}
              <button
                type="button"
                onClick={() => setBadges(badges.filter((x) => x !== b))}
                className="hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newBadge}
            onChange={(e) => setNewBadge(e.target.value)}
            placeholder="New badge"
            className="h-8"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!newBadge.trim()) return
              setBadges([...badges, newBadge.trim()])
              setNewBadge('')
            }}
          >
            Add
          </Button>
        </div>
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => run('badges', () => updateBadges(profile.id, badges), 'Badges saved')}
        >
          {busy === 'badges' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Save badges
        </Button>
      </SectionCard>

      <SectionCard title="Streak (manual override)">
        <Input type="number" min={0} value={streak} onChange={(e) => setStreak(e.target.value)} />
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => run('streak', () => adjustUserStreak(profile.id, Number(streak)), 'Streak updated')}
        >
          {busy === 'streak' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Save streak
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
        <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="@username" />
        <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Display name" />
        <Button
          size="sm"
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
  )
}
