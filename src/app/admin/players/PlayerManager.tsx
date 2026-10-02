'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { rewardText, UPGRADE_OPTIONS } from '@/lib/rewards'
import { cancelGrant, listGrants, listPlayers, sendGrant, type GrantRow, type PlayerRow } from './actions'

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

// One player's panel: set their balance, send a gift, and see what's
// been sent (pending gifts can be cancelled before they're delivered).
function PlayerDetail({ player }: { player: PlayerRow }) {
  const [grants, setGrants] = useState<GrantRow[] | null>(null)
  const [balance, setBalance] = useState('')
  const [kind, setKind] = useState<'bricks' | 'boost' | 'upgrade'>('bricks')
  const [amount, setAmount] = useState('')
  const [upgrade, setUpgrade] = useState(UPGRADE_OPTIONS[0].value)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () =>
    listGrants(player.id)
      .then(setGrants)
      .catch(() => setGrants([]))
  useEffect(() => {
    load()
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
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send a gift</p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="bricks">Bricks</option>
            <option value="boost">Crew boost (minutes)</option>
            <option value="upgrade">Free upgrade</option>
          </Select>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
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
          Send gift
        </Button>
      </div>

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

export default function PlayerManager({ initialPlayers }: { initialPlayers: PlayerRow[] }) {
  const [players, setPlayers] = useState(initialPlayers)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
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
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
          placeholder="Search by player ID"
          className="font-mono uppercase"
          autoCapitalize="characters"
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
                  <p className="font-mono text-base font-semibold tracking-wider">{p.short_id}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Lv {p.level} · 🧱 {fmt(p.scrap)} · {p.plots} plot{p.plots === 1 ? '' : 's'} · {p.workers} workers · {ago(p.last_seen)}
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-border p-3">
                  <PlayerDetail player={p} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
