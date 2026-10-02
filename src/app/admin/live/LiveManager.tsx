'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EVENT_KINDS, eventInfo, eventTitle, type LiveEventKind } from '@/lib/liveEvents'
import { rewardText, UPGRADE_OPTIONS } from '@/lib/rewards'
import { StatusBadge } from '../ads/AdInsights'
import {
  createBroadcast,
  createEvent,
  createGlobalGift,
  deleteLive,
  listLive,
  setLiveActive,
  type BroadcastRow,
  type EventRow,
  type GiftRow,
  type LiveTable,
} from './actions'

type Data = { events: EventRow[]; broadcasts: BroadcastRow[]; gifts: GiftRow[] }
type Res = { ok: true } | { ok: false; message: string }

const LENGTHS: { label: string; hours: number }[] = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '6 hours', hours: 6 },
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
]

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
)

// Start now or later, and run for a preset length or until a set time.
function useWindow() {
  const [startNow, setStartNow] = useState(true)
  const [start, setStart] = useState('')
  const [hours, setHours] = useState<number | null>(24)
  const [end, setEnd] = useState('')
  const resolve = (): { startsAt: string; endsAt: string } | string => {
    const s = startNow ? new Date() : start ? new Date(start) : null
    if (!s) return 'Pick when it starts'
    const e = hours !== null ? new Date(s.getTime() + hours * 3600e3) : end ? new Date(end) : null
    if (!e) return 'Pick when it ends'
    return { startsAt: s.toISOString(), endsAt: e.toISOString() }
  }
  const ui = (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Starts</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={startNow} onClick={() => setStartNow(true)}>
            Now
          </Chip>
          <Chip on={!startNow} onClick={() => setStartNow(false)}>
            Later
          </Chip>
        </div>
        {!startNow && <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="min-w-0" />}
      </div>
      <div className="space-y-1">
        <Label>Runs for</Label>
        <div className="flex flex-wrap gap-1.5">
          {LENGTHS.map((l) => (
            <Chip key={l.hours} on={hours === l.hours} onClick={() => setHours(l.hours)}>
              {l.label}
            </Chip>
          ))}
          <Chip on={hours === null} onClick={() => setHours(null)}>
            Until…
          </Chip>
        </div>
        {hours === null && <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="min-w-0" />}
      </div>
    </div>
  )
  return { ui, resolve }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-foreground text-background' : 'bg-secondary'}`}
    >
      {children}
    </button>
  )
}

function Row({
  title,
  sub,
  row,
  table,
  onChanged,
}: {
  title: React.ReactNode
  sub: React.ReactNode
  row: { id: string; active: boolean; starts_at: string; ends_at: string }
  table: LiveTable
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<Res>) => {
    setBusy(true)
    const r = await fn().catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(false)
    if (!r.ok) toast.error(r.message)
    else onChanged()
  }
  return (
    <div className="flex items-start justify-between gap-2 border-t border-border py-2 first:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {when(row.starts_at)} → {when(row.ends_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge ad={row} />
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setLiveActive(table, row.id, !row.active))}
          className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
        >
          {row.active ? 'Turn off' : 'Turn on'}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Delete"
          onClick={() => confirm('Delete this?') && run(() => deleteLive(table, row.id))}
          className="p-1 text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function Card({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      {children}
    </div>
  )
}

export default function LiveManager({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => listLive().then(setData).catch(() => toast.error("Couldn't refresh"))

  const submit = async (key: string, fn: () => Promise<Res>, done: () => void) => {
    setBusy(key)
    const r = await fn().catch(() => ({ ok: false as const, message: 'Something went wrong' }))
    setBusy(null)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    toast.success('Scheduled — games pick it up within about 30 seconds')
    done()
    refresh()
  }

  // Event form
  const [kind, setKind] = useState<LiveEventKind>('double_bricks')
  const [value, setValue] = useState(String(eventInfo('double_bricks').default))
  const evWin = useWindow()
  const info = eventInfo(kind)

  // Message form
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [style, setStyle] = useState<'popup' | 'banner'>('popup')
  const msgWin = useWindow()

  // Gift form
  const [gKind, setGKind] = useState<'bricks' | 'boost' | 'upgrade'>('bricks')
  const [gAmount, setGAmount] = useState('')
  const [gUpgrade, setGUpgrade] = useState(UPGRADE_OPTIONS[0].value)
  const [gMessage, setGMessage] = useState('')
  const giftWin = useWindow()

  return (
    <div className="w-full max-w-lg space-y-4">
      <h1 className="text-lg font-semibold">Events &amp; messages</h1>
      <p className="text-sm text-muted-foreground">Everything here reaches every player. Games pick changes up within about 30 seconds.</p>

      <Card title="Events" help="Players get a popup when it starts and a countdown at the top while it runs. Events of the same kind stack.">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as LiveEventKind
              setKind(k)
              setValue(String(eventInfo(k).default))
            }}
          >
            {EVENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.emoji} {k.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1.5">
            <Input type="number" step={info.unit === 'percent' ? 5 : 0.5} value={value} onChange={(e) => setValue(e.target.value)} />
            <span className="shrink-0 text-sm text-muted-foreground">{info.unit === 'percent' ? '% off' : '×'}</span>
          </div>
        </div>
        {evWin.ui}
        <Button
          className="w-full"
          disabled={busy !== null || !value}
          onClick={() => {
            const w = evWin.resolve()
            if (typeof w === 'string') return toast.error(w)
            submit('event', () => createEvent(kind, Number(value), w.startsAt, w.endsAt), () => {})
          }}
        >
          {busy === 'event' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Schedule {eventTitle(kind, Number(value) || info.default)}
        </Button>
        <div>
          {data.events.map((e) => (
            <Row
              key={e.id}
              table="event"
              row={e}
              onChanged={refresh}
              title={`${eventInfo(e.kind).emoji} ${eventTitle(e.kind, e.value)}`}
              sub={eventInfo(e.kind).label}
            />
          ))}
        </div>
      </Card>

      <Card title="Message everyone" help="A popup shows once to each player who opens the game while it's live. A banner stays at the top until it ends or they close it.">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. New buildings this weekend!" maxLength={80} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="More details (optional)"
          maxLength={300}
          rows={2}
          className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <div className="flex gap-1.5">
          <Chip on={style === 'popup'} onClick={() => setStyle('popup')}>
            Popup
          </Chip>
          <Chip on={style === 'banner'} onClick={() => setStyle('banner')}>
            Banner
          </Chip>
        </div>
        {msgWin.ui}
        <Button
          className="w-full"
          disabled={busy !== null || !title.trim()}
          onClick={() => {
            const w = msgWin.resolve()
            if (typeof w === 'string') return toast.error(w)
            submit('message', () => createBroadcast(title, body, style, w.startsAt, w.endsAt), () => {
              setTitle('')
              setBody('')
            })
          }}
        >
          {busy === 'message' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Schedule message
        </Button>
        <div>
          {data.broadcasts.map((b) => (
            <Row
              key={b.id}
              table="broadcast"
              row={b}
              onChanged={refresh}
              title={`📣 ${b.title}`}
              sub={`${b.style === 'popup' ? 'Popup' : 'Banner'}${b.body ? ` · ${b.body}` : ''}`}
            />
          ))}
        </div>
      </Card>

      <Card title="Gift everyone" help="Everyone who opens the game while it's live gets it once — new players too.">
        <div className="grid grid-cols-2 gap-2">
          <Select value={gKind} onChange={(e) => setGKind(e.target.value as typeof gKind)}>
            <option value="bricks">Bricks</option>
            <option value="boost">Crew boost (minutes)</option>
            <option value="upgrade">Free upgrade</option>
          </Select>
          <Input type="number" min={1} value={gAmount} onChange={(e) => setGAmount(e.target.value)} placeholder="Amount" />
        </div>
        {gKind === 'upgrade' && (
          <Select value={gUpgrade} onChange={(e) => setGUpgrade(e.target.value)}>
            {UPGRADE_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        )}
        <Input value={gMessage} onChange={(e) => setGMessage(e.target.value)} placeholder="Message (optional), e.g. Thanks for playing!" maxLength={140} />
        {giftWin.ui}
        <Button
          className="w-full"
          disabled={busy !== null || !gAmount}
          onClick={() => {
            const w = giftWin.resolve()
            if (typeof w === 'string') return toast.error(w)
            submit(
              'gift',
              () => createGlobalGift(gKind, Number(gAmount), gKind === 'upgrade' ? gUpgrade : null, gMessage, w.startsAt, w.endsAt),
              () => {
                setGAmount('')
                setGMessage('')
              }
            )
          }}
        >
          {busy === 'gift' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Schedule gift
        </Button>
        <div>
          {data.gifts.map((g) => (
            <Row
              key={g.id}
              table="gift"
              row={g}
              onChanged={refresh}
              title={`🎁 ${rewardText(g.kind, g.amount, g.upgrade)}`}
              sub={`${g.claims.toLocaleString()} claimed${g.message ? ` · ${g.message}` : ''}`}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}
