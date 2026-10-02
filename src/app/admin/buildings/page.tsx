import Link from 'next/link'
import { Plus } from 'lucide-react'
import { bricksFromCells, cellsFromBlueprint, decodeCells } from '@/lib/game/shapes'
import { BUILDINGS, brickCount } from '@/lib/game/buildings'
import Thumb from './Thumb'
import DuplicateButton from './DuplicateButton'
import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import { StatusBadge } from '../ads/AdInsights'
import { listBuildings } from './actions'
import { getBuildingStats } from '../statsActions'
import { fmtDuration, fmtNum } from '../format'

export default async function BuildingsAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Buildings" />
  const [buildings, stats] = await Promise.all([listBuildings(), getBuildingStats()])
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
          const cells = decodeCells(b.shape.size, b.shape.data)
          const bricks = bricksFromCells(b.shape.size, cells).length
          return (
            <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <Link href={`/admin/buildings/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Thumb size={b.shape.size} cells={cells} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {b.emoji} {b.name}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    Lv {b.required_level} · 🧱 {Math.round(b.contract_cost).toLocaleString()} to start · {bricks.toLocaleString()} bricks
                  </span>
                  <span className="mt-1 block">
                    <StatusBadge ad={b} />
                  </span>
                </span>
              </Link>
              <DuplicateButton source={b.id} />
            </div>
          )
        })}

        <div className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold">Built-in buildings</h2>
          <p className="text-xs text-muted-foreground">Always in the game. Duplicate one to start a new building from it.</p>
          {BUILDINGS.map((b) => {
            const { size, cells } = cellsFromBlueprint(b.blueprint)
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <Thumb size={size} cells={cells} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    Lv {b.requiredLevel} · 🧱 {Math.round(b.contractCost).toLocaleString()} to start · {brickCount(b).toLocaleString()} bricks
                  </span>
                </span>
                <DuplicateButton source={b.id} />
              </div>
            )
          })}
        </div>

        <div className="space-y-2 pt-4">
          <h2 className="text-sm font-semibold">How players are doing</h2>
          <p className="text-xs text-muted-foreground">
            Last 90 days. Time to clear counts time spent demolishing, including while players were away.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 font-medium">Building</th>
                  <th className="p-2 text-right font-medium">Started</th>
                  <th className="p-2 text-right font-medium">Finished</th>
                  <th className="p-2 text-right font-medium">Typical time</th>
                  <th className="p-2 text-right font-medium">Average</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.building} className="border-b border-border last:border-0">
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 text-right">{fmtNum(s.started)}</td>
                    <td className="p-2 text-right">{fmtNum(s.finished)}</td>
                    <td className="p-2 text-right">{s.medianSeconds === null ? '—' : fmtDuration(s.medianSeconds)}</td>
                    <td className="p-2 text-right">{s.avgSeconds === null ? '—' : fmtDuration(s.avgSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
