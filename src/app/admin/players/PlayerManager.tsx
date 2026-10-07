'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Eye, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { rewardText, UPGRADE_OPTIONS } from '@/lib/rewards'
import { fmtDuration } from '../format'
import { getPlayerActivity, type ActivityItem } from '../statsActions'
import { banPlayer, listBackups, restoreBackup, unbanPlayer, type BackupRow } from './actions'
import { adminSetUsername, cancelGrant, listGrants, listPlayers, resetPlayer, sendGrant, type GrantRow, type PlayerRow } from './actions'

function fmt(n: number) {
  return Math.round(n).toLocaleString()
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

const AD_NAMES: Record<string, string> = { rewarded: 'reward ad', interstitial: 'full-screen ad', banner: 'banner', billboard: 'billboard' }

function activityText(a: ActivityItem): string {
  if (a.type === 'session') return `Played for ${fmtDuration(a.seconds)}`
  if (a.type === 'building')
    return a.kind === 'building_started' ? `Started ${a.name}` : `Finished ${a.name}${a.seconds !== null ? ` in ${fmtDuration(a.seconds)}` : ''}`
  const ad = AD_NAMES[a.placement ?? ''] ?? 'ad'
  if (a.event === 'complete') return `Watched a ${ad}${a.bricks ? ` (+🧱${fmt(a.bricks)})` : ''}`
  if (a.event === 'skip') return `Skipped a ${ad}`
  return `Tapped a ${ad}`
}

// Visits, buildings and ads for the last 90 days (loaded on demand).
function PlayerActivity({ playerId }: { playerId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const show = async () => {
    setLoading(true)
    try {
      setItems(await getPlayerActivity(playerId))
    } catch {
      toast.error("Couldn't load activity")
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity (90 days)</p>
        <button type="button" onClick={show} disabled={loading} className="text-xs font-medium text-[#2d7ff9] disabled:opacity-50">
          {loading ? 'Loading…' : items ? 'Refresh' : 'Show'}
        </button>
      </div>
      {items?.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet.</p>}
      {items && items.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {items.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{activityText(a)}</span>
              <span className="shrink-0 text-muted-foreground">{ago(a.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function isBanned(p: PlayerRow) {
  return p.ban_permanent || (!!p.ban_until && new Date(p.ban_until).getTime() > Date.now())
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const BAN_LENGTHS: { label: string; hours: number | null }[] = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'Custom', hours: -1 },
  { label: 'Permanent', hours: null },
]

// Ban (with a required reason the player sees) or lift a ban.
function BanPanel({ player, onChange }: { player: PlayerRow; onChange: (p: Partial<PlayerRow>) => void }) {
  const [reason, setReason] = useState('')
  const [length, setLength] = useState<number | null>(24)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const banned = isBanned(player)

  const ban = async () => {
    const until = length === null ? null : length === -1 ? (custom ? new Date(custom).toISOString() : '') : new Date(Date.now() + length * 3600e3).toISOString()
    if (until === '') {
      toast.error('Pick when the ban ends')
      return
    }
    setBusy(true)
    const r = await banPlayer(player.id, reason, until).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    toast.success('Banned — they see it on their next sync')
    setReason('')
    onChange({ ban_until: until, ban_permanent: until === null, ban_reason: reason.trim() })
  }

  const unban = async () => {
    setBusy(true)
    const r = await unbanPlayer(player.id).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    toast.success('Unbanned')
    onChange({ ban_until: null, ban_permanent: false, ban_reason: null })
  }

  if (banned)
    return (
      <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50/60 p-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Banned</p>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-xs text-red-800">
            {player.ban_permanent ? 'Permanently' : `Until ${when(player.ban_until!)}`}
            {player.ban_reason ? ` · “${player.ban_reason}”` : ''}
          </p>
          <Button variant="secondary" disabled={busy} className="shrink-0" onClick={unban}>
            Unban
          </Button>
        </div>
      </div>
    )

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ban</p>
      <div className="flex flex-wrap gap-1.5">
        {BAN_LENGTHS.map((l) => (
          <button
            key={l.label}
            type="button"
            onClick={() => setLength(l.hours)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${length === l.hours ? 'bg-red-600 text-white' : 'bg-secondary'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {length === -1 && <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="min-w-0" />}
      <div className="flex gap-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the player sees this)" maxLength={200} />
        <Button variant="secondary" className="shrink-0 text-red-700" disabled={busy || !reason.trim()} onClick={ban}>
          Ban
        </Button>
      </div>
    </div>
  )
}

// Saves taken right before each admin change; restoring one undoes it.
function BackupsPanel({ playerId, refreshKey, onRestored }: { playerId: string; refreshKey: number; onRestored: () => void }) {
  const [rows, setRows] = useState<BackupRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    listBackups(playerId)
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [playerId, refreshKey])
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Backups</p>
      <p className="text-xs text-muted-foreground">Taken right before every change you make here. Restoring one puts that save back on their next sync.</p>
      {rows === null && <p className="text-xs text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
      {rows?.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate">
            {when(b.created_at)} · {b.reason.replace(/^Before: /, 'before ')}
            <span className="text-muted-foreground">
              {' '}
              · Lv {b.level} · 🧱 {fmt(b.scrap)}
            </span>
          </span>
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-medium disabled:opacity-50"
            onClick={async () => {
              if (!confirm(`Restore the save from ${when(b.created_at)}? Their current progress is backed up first.`)) return
              setBusy(true)
              const r = await restoreBackup(b.id).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
              setBusy(false)
              if (!r.ok) {
                toast.error(r.message)
                return
              }
              toast.success('Restored — their game switches on its next sync')
              onRestored()
            }}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  )
}

// One player's panel: set their balance, send a gift, and see what's
// been sent (pending gifts can be cancelled before they're delivered).
function PlayerDetail({
  player,
  onRenamed,
  onReset,
  onPatch,
}: {
  player: PlayerRow
  onRenamed: (name: string | null) => void
  onReset: () => void
  onPatch: (patch: Partial<PlayerRow>) => void
}) {
  const [backupKey, setBackupKey] = useState(0)
  const [grants, setGrants] = useState<GrantRow[] | null>(null)
  const [name, setName] = useState(player.username ?? '')
  const [renaming, setRenaming] = useState(false)

  const rename = async (next: string | null) => {
    setRenaming(true)
    const result = await adminSetUsername(player.id, next).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setRenaming(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success(next === null ? 'Name cleared' : 'Name changed')
    if (next === null) setName('')
    onRenamed(next === null ? null : next.trim())
  }
  const [balance, setBalance] = useState('')
  const [lvl, setLvl] = useState('')
  const [rainMin, setRainMin] = useState(60)
  const [kind, setKind] = useState<'bricks' | 'boost' | 'upgrade'>('bricks')
  const [amount, setAmount] = useState('')
  const [upgrade, setUpgrade] = useState(UPGRADE_OPTIONS[0].value)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // Gifts and backups change together (a backup is taken before each gift).
  const fetchGrants = () =>
    listGrants(player.id)
      .then(setGrants)
      .catch(() => setGrants([]))
  const load = () => {
    setBackupKey((k) => k + 1)
    return fetchGrants()
  }
  useEffect(() => {
    fetchGrants()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per player panel
  }, [player.id])

  const send = async (g: Parameters<typeof sendGrant>[1], done: () => void) => {
    setBusy(true)
    const result = await sendGrant(player.id, g).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success("Sent — it arrives next time their game syncs")
    done()
    load()
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/players/${player.id}/watch`}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-[#1d3a6e] py-2 text-sm font-medium text-white"
      >
        <Eye className="h-4 w-4" /> Watch their game
      </Link>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Username</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="No name" maxLength={16} />
          <Button disabled={renaming || !name.trim() || name.trim() === player.username} onClick={() => rename(name)}>
            Save
          </Button>
          <Button variant="secondary" disabled={renaming || !player.username} onClick={() => rename(null)}>
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Set balance</p>
        <div className="flex gap-2">
          <Input type="number" min={0} value={balance} onChange={(e) => setBalance(e.target.value)} placeholder={`Now ${fmt(player.scrap)}`} />
          <Button
            disabled={busy || balance === ''}
            onClick={() => send({ kind: 'set_bricks', amount: Number(balance), upgrade: null, message: '' }, () => setBalance(''))}
          >
            Set
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Set level</p>
        <div className="flex gap-2">
          <Input type="number" min={1} step={1} value={lvl} onChange={(e) => setLvl(e.target.value)} placeholder={`Now ${player.level}`} />
          <Button
            disabled={busy || lvl === ''}
            onClick={() => send({ kind: 'set_level', amount: Number(lvl), upgrade: null, message: '' }, () => setLvl(''))}
          >
            Set
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weather</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            [15, '15 min'],
            [60, '1 hour'],
            [180, '3 hours'],
            [1440, '1 day'],
          ].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setRainMin(m as number)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${rainMin === m ? 'bg-foreground text-background' : 'bg-secondary'}`}
            >
              {label}
            </button>
          ))}
          <Button size="sm" disabled={busy} onClick={() => send({ kind: 'rain', amount: rainMin, upgrade: null, message: '' }, () => {})}>
            🌧️ Make it rain
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send a gift or take away</p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="bricks">Bricks</option>
            <option value="boost">Crew boost (minutes)</option>
            <option value="upgrade">Free upgrade</option>
          </Select>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (− to take)" />
        </div>
        {kind === 'upgrade' && (
          <Select value={upgrade} onChange={(e) => setUpgrade(e.target.value)}>
            {UPGRADE_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        )}
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message (optional), e.g. Thanks for playing!" maxLength={140} />
        <Button
          className="w-full"
          disabled={busy || !amount}
          onClick={() =>
            send({ kind, amount: Number(amount), upgrade: kind === 'upgrade' ? upgrade : null, message }, () => {
              setAmount('')
              setMessage('')
            })
          }
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {Number(amount) < 0 ? 'Take away' : 'Send gift'}
        </Button>
      </div>

      <BanPanel player={player} onChange={onPatch} />

      <div className="space-y-1.5 rounded-lg border border-red-200 bg-red-50/60 p-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Danger zone</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-red-800">Wipe their progress back to a fresh start. Keeps their name and ID.</p>
          <Button
            variant="secondary"
            disabled={busy}
            className="shrink-0 text-red-700"
            onClick={async () => {
              const who = player.username ?? player.short_id
              if (!confirm(`Reset ${who}? All their bricks, plots, workers and upgrades go back to the start. This can't be undone.`)) return
              setBusy(true)
              const result = await resetPlayer(player.id, '').catch(() => ({ ok: false as const, message: 'Something went wrong' }))
              setBusy(false)
              if (!result.ok) {
                toast.error(result.message)
                return
              }
              toast.success(`${who} will reset next time their game syncs`)
              onReset()
              load()
            }}
          >
            Reset progress
          </Button>
        </div>
      </div>

      <BackupsPanel playerId={player.id} refreshKey={backupKey} onRestored={load} />

      <PlayerActivity playerId={player.id} />

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gifts &amp; codes</p>
        {grants === null && <p className="text-xs text-muted-foreground">Loading…</p>}
        {grants?.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet.</p>}
        {grants?.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">
              {rewardText(g.kind, g.amount, g.upgrade)}
              {g.message ? <span className="text-muted-foreground"> · {g.message}</span> : null}
            </span>
            {g.applied_at ? (
              <span className="shrink-0 text-muted-foreground">
                {g.source === 'code' ? 'code' : 'delivered'} {ago(g.applied_at)}
              </span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const r = await cancelGrant(g.id).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
                  if (r.ok) load()
                  else toast.error(r.message)
                }}
                className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
              >
                Pending · cancel
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlayerManager({ initialPlayers, initialSearch = '' }: { initialPlayers: PlayerRow[]; initialSearch?: string }) {
  const [players, setPlayers] = useState(initialPlayers)
  const [search, setSearch] = useState(initialSearch)
  // Coming from a dashboard link: open that player straight away.
  const [open, setOpen] = useState<string | null>(initialSearch && initialPlayers.length === 1 ? initialPlayers[0].id : null)
  const [searching, setSearching] = useState(false)

  const runSearch = async (q: string) => {
    setSearching(true)
    try {
      setPlayers(await listPlayers(q))
    } catch {
      toast.error("Couldn't load players")
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <h1 className="text-lg font-semibold">Players</h1>
      <p className="text-sm text-muted-foreground">
        Players find their ID in the game under the 👤 Profile button. Gifts and balance changes arrive the next time their game syncs
        (within about 30 seconds while they&apos;re playing).
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          runSearch(search)
        }}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or player ID"
          autoCapitalize="off"
        />
        <Button type="submit" variant="secondary" aria-label="Search">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {players.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No players found.</p>}
      <div className="space-y-2">
        {players.map((p) => {
          const isOpen = open === p.id
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card">
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-center gap-3 p-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">
                    {p.username ?? <span className="font-normal italic text-muted-foreground">No name</span>}{' '}
                    <span className="font-mono text-xs font-normal tracking-wider text-muted-foreground">{p.short_id}</span>
                    {isBanned(p) && <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">BANNED</span>}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Lv {p.level} · 🧱 {fmt(p.scrap)} · {p.plots} plot{p.plots === 1 ? '' : 's'} · {p.workers} workers · {fmtDuration(p.play_seconds)} played · {ago(p.last_seen)}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-border p-3">
                  <PlayerDetail
                    player={p}
                    onRenamed={(username) => setPlayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, username } : x)))}
                    onPatch={(patch) => setPlayers((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))}
                    onReset={() =>
                      setPlayers((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, scrap: 0, xp: 0, level: 1, plots: 1, workers: 1 } : x))
                      )
                    }
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
