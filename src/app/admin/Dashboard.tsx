'use client'

import { useState } from 'react'
import Link from 'next/link'
import { fmtDuration, fmtNum } from './format'
import type { Dashboard as Data, TopSort } from './statsActions'

const SORTS: { value: TopSort; label: string; show: (p: Data['top'][TopSort][number]) => string }[] = [
  { value: 'level', label: 'Level', show: (p) => `Lv ${p.level}` },
  { value: 'scrap', label: 'Bricks', show: (p) => `🧱 ${fmtNum(p.scrap)}` },
  { value: 'sites_cleared', label: 'Cleared', show: (p) => `${fmtNum(p.sites_cleared)} cleared` },
  { value: 'play_seconds', label: 'Time played', show: (p) => fmtDuration(p.play_seconds) },
]

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>}
    </div>
  )
}

// The admin home's overview: who's playing, and the top players by
// whichever column is picked.
export default function Dashboard({ data }: { data: Data }) {
  const [sort, setSort] = useState<TopSort>('level')
  const col = SORTS.find((s) => s.value === sort)!
  const top = data.top[sort]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Players" value={fmtNum(data.players)} sub={`+${fmtNum(data.newToday)} today · +${fmtNum(data.newWeek)} this week`} />
        <Stat label="Played today" value={fmtNum(data.activeToday)} sub={`${fmtNum(data.activeWeek)} this week`} />
        <Stat label="Came back this week" value={fmtNum(data.returningWeek)} sub="played on 2+ days" />
        <Stat
          label="Visits this week"
          value={fmtNum(data.sessionsWeek)}
          sub={data.sessionsWeek ? `avg ${fmtDuration(data.avgSessionSeconds)} · ${fmtDuration(data.playSecondsWeek)} total` : undefined}
        />
        <div className="col-span-2">
          <Stat label="Bricks held by all players" value={`🧱 ${fmtNum(data.bricksInGame)}`} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Top players</p>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSort(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${sort === s.value ? 'bg-foreground text-background' : 'bg-secondary'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {top.length === 0 && <p className="py-2 text-xs text-muted-foreground">No players yet.</p>}
        <ol className="space-y-1">
          {top.map((p, i) => (
            <li key={p.id}>
              <Link href={`/admin/players?q=${p.short_id}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-accent">
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {p.username ?? <span className="italic text-muted-foreground">No name</span>}{' '}
                  <span className="font-mono text-xs text-muted-foreground">{p.short_id}</span>
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums">{col.show(p)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
