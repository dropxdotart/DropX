import Link from 'next/link'
import { Plus } from 'lucide-react'
import { bricksFromCells, decodeCells } from '@/lib/game/shapes'
import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import { StatusBadge } from '../ads/AdInsights'
import { listBuildings } from './actions'

export default async function BuildingsAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Buildings" />
  const buildings = await listBuildings()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Buildings</h1>
          <Link href="/admin/buildings/new" className="inline-flex items-center gap-1 rounded-full bg-[#ff6b1a] px-3 py-1.5 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> New building
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Your own buildings join the 8 built-in ones in the game&apos;s building picker while they&apos;re on.
        </p>
        {buildings.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No buildings yet — make one!</p>}
        {buildings.map((b) => {
          const bricks = bricksFromCells(b.shape.size, decodeCells(b.shape.size, b.shape.data)).length
          return (
            <Link key={b.id} href={`/admin/buildings/${b.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-2xl">{b.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{b.name}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">
                  Lv {b.required_level} · 🧱 {Math.round(b.contract_cost).toLocaleString()} to start · {bricks.toLocaleString()} bricks
                </span>
              </span>
              <StatusBadge ad={b} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
