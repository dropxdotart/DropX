'use client'

import { useState } from 'react'
import { Loader2, Shuffle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { rewardText, UPGRADE_OPTIONS } from '@/lib/rewards'
import { createCode, deleteCode, listCodes, setCodeActive, type CodeKind, type RedeemCode } from './actions'

// Avoids look-alike characters so codes are easy to type.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomCode() {
  let s = 'RUBBLE-'
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

function status(c: RedeemCode): { label: string; tone: string } {
  if (!c.active) return { label: 'Off', tone: 'bg-secondary text-muted-foreground' }
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return { label: 'Expired', tone: 'bg-secondary text-muted-foreground' }
  if (c.max_uses !== null && c.uses >= c.max_uses) return { label: 'Used up', tone: 'bg-amber-100 text-amber-800' }
  return { label: 'Live', tone: 'bg-emerald-100 text-emerald-800' }
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function CodeManager({ initialCodes }: { initialCodes: RedeemCode[] }) {
  const [codes, setCodes] = useState(initialCodes)
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<CodeKind>('bricks')
  const [amount, setAmount] = useState('')
  const [upgrade, setUpgrade] = useState(UPGRADE_OPTIONS[0].value)
  const [maxUses, setMaxUses] = useState('')
  const [oncePerPlayer, setOncePerPlayer] = useState(true)
  const [expires, setExpires] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => setCodes(await listCodes())

  const create = async () => {
    setSaving(true)
    try {
      const result = await createCode({
        code: code.trim().toUpperCase(),
        kind,
        amount: Number(amount),
        upgrade: kind === 'upgrade' ? upgrade : null,
        maxUses: maxUses.trim() ? Number(maxUses) : null,
        oncePerPlayer,
        expiresAt: expires ? new Date(expires).toISOString() : null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`Created ${code.trim().toUpperCase()}`)
      setCode('')
      setAmount('')
      setMaxUses('')
      setExpires('')
      await refresh()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (c: RedeemCode) => {
    setBusyId(c.id)
    const result = await setCodeActive(c.id, !c.active).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusyId(null)
    if (result.ok) setCodes((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)))
    else toast.error(result.message)
  }

  const remove = async (c: RedeemCode) => {
    if (!confirm(`Delete ${c.code}? Players won't be able to use it, and its history is removed.`)) return
    setBusyId(c.id)
    const result = await deleteCode(c.id).catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusyId(null)
    if (result.ok) setCodes((prev) => prev.filter((x) => x.id !== c.id))
    else toast.error(result.message)
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">Redeem codes</h1>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">New code</p>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
            placeholder="CODE (e.g. RUBBLE100)"
            maxLength={24}
            className="font-mono uppercase"
          />
          <Button type="button" variant="secondary" onClick={() => setCode(randomCode())} aria-label="Random code">
            <Shuffle className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            Gives
            <Select value={kind} onChange={(e) => setKind(e.target.value as CodeKind)}>
              <option value="bricks">Bricks</option>
              <option value="boost">Crew boost (minutes)</option>
              <option value="upgrade">Free upgrade</option>
            </Select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            {kind === 'bricks' ? 'How many bricks' : kind === 'boost' ? 'Minutes' : 'How many'}
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" />
          </label>
        </div>
        {kind === 'upgrade' && (
          <label className="block space-y-1 text-xs text-muted-foreground">
            Which upgrade
            <Select value={upgrade} onChange={(e) => setUpgrade(e.target.value)}>
              {UPGRADE_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            Max total uses
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Expires (optional)
            <input
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={oncePerPlayer} onChange={(e) => setOncePerPlayer(e.target.checked)} className="h-4 w-4" />
          Once per player
        </label>

        <Button onClick={create} disabled={saving || !code.trim() || !amount} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create code
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Codes</p>
        {codes.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No codes yet.</p>}
        {codes.map((c) => {
          const s = status(c)
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-base font-semibold">{c.code}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>
                  </div>
                  <p className="text-sm">{rewardText(c.kind, c.amount, c.upgrade)}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {c.uses} {c.max_uses !== null ? `/ ${c.max_uses} ` : ''}used
                    {c.once_per_player ? ' · once per player' : ' · repeatable'}
                    {c.expires_at ? ` · ${new Date(c.expires_at) > new Date() ? 'expires' : 'expired'} ${when(c.expires_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => toggle(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                      c.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {c.active ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => remove(c)}
                    className="p-2 text-destructive disabled:opacity-50"
                    aria-label={`Delete ${c.code}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
