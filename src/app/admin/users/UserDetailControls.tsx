'use client'

import { useRef, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AVAILABLE_BADGES } from '@/lib/badges'
import { ADMIN_ACTION_LABELS } from '@/lib/audit'
import StreakCalendar from '@/components/streak/StreakCalendar'
import {
  updateUserRole,
  updateAccountStatus,
  updateBadges,
  issueStrike,
  revokeStrike,
  toggleStreakDay,
  resetStreakDay,
  extendStreakToToday,
  overrideIdentity,
  adminSetAvatarUrl,
  adminUploadAvatar,
} from './actions'
import type { Profile, Strike, AdminAction, AvatarPreset, UserRole, AccountStatus } from '@/lib/types'
import type { StreakDay } from '@/lib/streak'

type StrikeWithIssuer = Strike & {
  issuer: { username: string | null; display_name: string | null } | null
  revoker: { username: string | null; display_name: string | null } | null
}
type ActionWithActor = AdminAction & { actor: { username: string | null; display_name: string | null } | null }

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
  actions,
  presets,
  onMutated,
}: {
  profile: Profile
  streakDays: StreakDay[]
  strikes: StrikeWithIssuer[]
  actions: ActionWithActor[]
  presets: AvatarPreset[]
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
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const avatarFileRef = useRef<HTMLInputElement>(null)

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
    run('role', () => updateUserRole(profile.id, role, profile.role), 'Role updated')
  }

  const toggleBadge = (badge: string) => {
    setBadges((prev) => (prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]))
  }

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    run('avatar', () => adminUploadAvatar(profile.id, formData), 'Photo updated')
    e.target.value = ''
  }

  const handleChoosePreset = (url: string) => {
    run('avatar', () => adminSetAvatarUrl(profile.id, url), 'Photo updated')
    setGalleryOpen(false)
  }

  const handleRemoveAvatar = () => {
    run('avatar', () => adminSetAvatarUrl(profile.id, null), 'Photo removed')
  }

  const activeStrikeCount = strikes.filter((s) => !s.revoked_at).length

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
                onClick={() => run('status', () => updateAccountStatus(profile.id, status, profile.account_status), 'Status updated')}
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
                onClick={() =>
                  run(
                    'identity',
                    () => overrideIdentity(profile.id, newUsername, newDisplayName, profile.username, profile.display_name),
                    'Identity updated'
                  )
                }
              >
                {busy === 'identity' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Avatar">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-lg font-bold text-muted-foreground">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (profile.display_name ?? profile.username)?.[0]?.toUpperCase() ?? '?'
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => avatarFileRef.current?.click()}>
                    {busy === 'avatar' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Upload
                  </Button>
                  {presets.length > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setGalleryOpen(true)}>
                      Gallery
                    </Button>
                  )}
                </div>
                {profile.avatar_url && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleRemoveAvatar}
                    className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} disabled={busy !== null} />
          </SectionCard>

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
                onClick={() => run('badges', () => updateBadges(profile.id, badges, profile.badges), 'Badges saved')}
              >
                {busy === 'badges' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save badges
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="Strikes"
            action={activeStrikeCount > 0 ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{activeStrikeCount}</Badge> : undefined}
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
              <div className="max-h-40 space-y-2 overflow-y-auto border-t border-white/10 pt-2">
                {strikes.map((s) => {
                  const revoking = busy === `revoke-${s.id}`
                  return (
                    <div key={s.id} className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-muted-foreground', s.revoked_at && 'line-through opacity-60')}>
                          {new Date(s.created_at).toLocaleString()} — by{' '}
                          {s.issuer?.display_name ?? s.issuer?.username ?? 'Someone'}
                        </p>
                        {!s.revoked_at && (
                          <button
                            type="button"
                            title="Revoke this strike"
                            disabled={busy !== null}
                            onClick={() => run(`revoke-${s.id}`, () => revokeStrike(s.id), 'Strike revoked')}
                            className="shrink-0 flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            {revoking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                            Revoke
                          </button>
                        )}
                      </div>
                      {s.reason && <p className={cn(s.revoked_at && 'line-through opacity-60')}>{s.reason}</p>}
                      {s.revoked_at && (
                        <p className="text-[color:var(--neon-violet)]">
                          Revoked {new Date(s.revoked_at).toLocaleString()} by{' '}
                          {s.revoker?.display_name ?? s.revoker?.username ?? 'Someone'}
                        </p>
                      )}
                    </div>
                  )
                })}
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

      <Card className="border-white/10 bg-card">
        <CardHeader><CardTitle className="text-sm">Activity</CardTitle></CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No admin actions on this account yet.</p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {actions.map((a) => (
                <div key={a.id} className="text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <p>
                    <span className="font-medium text-white">{ADMIN_ACTION_LABELS[a.action] ?? a.action}</span>{' '}
                    <span className="text-muted-foreground">
                      by {a.actor?.display_name ?? a.actor?.username ?? 'Someone'} · {new Date(a.created_at).toLocaleString()}
                    </span>
                  </p>
                  {a.detail && <p className="text-muted-foreground">{a.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Choose an avatar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-4 gap-3">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.label ?? undefined}
                disabled={busy !== null}
                onClick={() => handleChoosePreset(p.image_url)}
                className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-[color:var(--neon-violet)] focus-visible:border-[color:var(--neon-violet)] outline-none transition-colors disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL */}
                <img src={p.image_url} alt={p.label ?? ''} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
