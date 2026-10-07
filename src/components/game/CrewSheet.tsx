'use client'

import { useRef, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { getBuilding } from '@/lib/game/buildings'
import type { Engine, Snapshot } from '@/lib/game/engine'
import { plotName } from './PlotsSheet'

// A − / + button that keeps going (faster and faster) while held.
function HoldButton({ onStep, label, children }: { onStep: () => void; label: string; children: React.ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const start = () => {
    stop()
    onStep()
    let delay = 380
    const tick = () => {
      onStep()
      delay = Math.max(45, delay * 0.75)
      timer.current = setTimeout(tick, delay)
    }
    timer.current = setTimeout(tick, delay)
  }
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault()
        start()
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-xl bg-white text-[#1d3a6e] shadow-[0_3px_0_#c9d3e3] active:translate-y-[2px] active:shadow-none"
    >
      {children}
    </button>
  )
}

// The count; tap it to type how many workers this plot should have.
function CountField({ value, onSet }: { value: number; onSet: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!editing)
    return (
      <button
        onClick={() => {
          setText(String(value))
          setEditing(true)
        }}
        className="min-w-[3.5rem] rounded-xl px-2 py-1 font-display text-2xl tabular-nums text-[#1d3a6e] active:bg-white"
        aria-label="Type a number of workers"
      >
        {value}
      </button>
    )
  const done = () => {
    const n = parseInt(text, 10)
    if (Number.isFinite(n)) onSet(n)
    setEditing(false)
  }
  return (
    <input
      autoFocus
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={done}
      onKeyDown={(e) => e.key === 'Enter' && done()}
      className="w-16 rounded-xl border-2 border-[#2d7ff9] bg-white px-1 py-0.5 text-center font-display text-2xl tabular-nums text-[#1d3a6e] outline-none"
    />
  )
}

// Opened by tapping the plot card at the top: how the crew is split
// between the plots being demolished.
export default function CrewSheet({ engine, snap, focus, onClose }: { engine: Engine; snap: Snapshot; focus: number; onClose: () => void }) {
  const active = snap.plots.filter((p) => p.phase === 'demolishing')
  const total = snap.plots.reduce((n, p) => n + p.crew, 0)
  const mode = snap.crewMode
  const set = (fn: () => void) => {
    fn()
    engine.notify()
  }
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">👷 Crew · {total}</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>

        {active.length < 2 ? (
          <p className="rounded-2xl bg-[#eef2f8] p-4 text-center text-sm text-[#5b6f93]">
            Your whole crew is on {active[0] ? plotName(active[0].id) : 'one plot'}. Start a building on another plot to split them up.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ['even', 'Split evenly', () => engine.setCrewEven()],
                  ['work', 'By work left', () => engine.setCrewAuto()],
                ] as const
              ).map(([m, label, fn]) => (
                <button
                  key={m}
                  onClick={() => set(fn)}
                  className={`rounded-2xl py-2.5 font-display text-sm ${
                    mode === m ? 'bg-[#2d7ff9] text-white shadow-[0_3px_0_#1d5fc4]' : 'bg-[#eef2f8] text-[#1d3a6e] shadow-[0_3px_0_#d5ddea]'
                  }`}
                >
                  {mode === m ? '✓ ' : ''}
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {active.map((p) => {
                const pct = Math.round((1 - p.bricksLeft / Math.max(1, p.bricksTotal)) * 100)
                return (
                  <div key={p.id} className={`rounded-2xl p-3 ${p.id === focus ? 'bg-[#e3eeff] ring-2 ring-[#2d7ff9]' : 'bg-[#eef2f8]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-base leading-tight text-[#1d3a6e]">{plotName(p.id)}</p>
                        <p className="truncate text-xs text-[#5b6f93]">
                          {getBuilding(p.buildingId).name} · {pct}% done
                          {p.crew !== p.crewTarget && ` · ${p.crew} there now`}
                        </p>
                      </div>
                      <button
                        onClick={() => set(() => engine.setCrew(p.id, total))}
                        className="shrink-0 rounded-full bg-white px-3 py-1 font-display text-xs text-[#1d3a6e] shadow-[0_2px_0_#c9d3e3]"
                      >
                        All here
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <HoldButton label="One less worker here" onStep={() => set(() => engine.adjustCrew(p.id, -1))}>
                        <Minus className="h-5 w-5" />
                      </HoldButton>
                      <CountField value={p.crewTarget} onSet={(n) => set(() => engine.setCrew(p.id, n))} />
                      <HoldButton label="One more worker here" onStep={() => set(() => engine.adjustCrew(p.id, 1))}>
                        <Plus className="h-5 w-5" />
                      </HoldButton>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
