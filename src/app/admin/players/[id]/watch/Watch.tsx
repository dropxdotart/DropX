'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Engine, type SaveData } from '@/lib/game/engine'
import { fmtAgo, fmtNum } from '../../../format'
import { getPlayerSave, type WatchData } from '../../actions'

const Scene = dynamic(() => import('@/components/game3d/Scene'), { ssr: false })
const REFRESH_MS = 15000
const noop = () => {}

function Viewer({ engine }: { engine: Engine }) {
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
  const [flyTo, setFlyTo] = useState({ plot: 0, nonce: 0 })
  return (
    <>
      <Scene
        engine={engine}
        snap={snap}
        focus={null}
        flyTo={flyTo}
        onSelectStation={noop}
        onSelectTruck={noop}
        onBreakTap={noop}
        onFocusPlot={(plot) => setFlyTo((f) => ({ plot, nonce: f.nonce + 1 }))}
        onPlotAction={(plot) => setFlyTo((f) => ({ plot, nonce: f.nonce + 1 }))}
        onLoadProgress={noop}
        onOpenBonus={noop}
        onSelectManager={noop}
        onNeed={noop}
      />
      {snap.plots.length > 1 && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
          {snap.plots.map((p) => (
            <button
              key={p.id}
              onClick={() => setFlyTo((f) => ({ plot: p.id, nonce: f.nonce + 1 }))}
              className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#1d3a6e] shadow"
            >
              Plot {p.id + 1}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// The admin's read-only view of a player's city, rebuilt from their cloud
// save whenever their game syncs (about every 30 seconds while playing).
// It runs on its own in between, so it's close to — not exactly — what
// they see.
export default function Watch({ playerId, initial }: { playerId: string; initial: NonNullable<WatchData> }) {
  const [data, setData] = useState(initial)
  useEffect(() => {
    const t = setInterval(() => {
      getPlayerSave(playerId)
        .then((d) => d && d.last_seen !== data.last_seen && setData(d))
        .catch(() => {})
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [playerId, data.last_seen])

  const engine = useMemo(() => (data.save ? Engine.viewer(data.save as SaveData) : null), [data.save])
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000) // keep "synced … ago" fresh
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#9fd4ef]">
      <div className="absolute inset-0">{engine && <Viewer key={data.last_seen} engine={engine} />}</div>
      <div className="pointer-events-auto absolute inset-x-3 top-3 flex items-center gap-2 rounded-2xl bg-white/95 p-2.5 shadow">
        <Link href={`/admin/players?q=${data.short_id}`} className="rounded-full bg-[#eef2f8] p-1.5" aria-label="Back">
          <ChevronLeft className="h-4 w-4 text-[#1d3a6e]" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#1d3a6e]">
            👁 {data.username ?? 'No name'} <span className="font-mono text-xs font-normal text-[#5b6f93]">{data.short_id}</span>
          </p>
          <p className="text-xs tabular-nums text-[#5b6f93]">
            Lv {data.level} · 🧱 {fmtNum(data.scrap)} · synced {fmtAgo(data.last_seen)}
          </p>
        </div>
      </div>
      {!engine && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-[#1d3a6e]">This player hasn&apos;t synced a game yet.</p>}
    </div>
  )
}
