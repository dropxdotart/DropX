'use client'

import { useEffect, useRef, useState } from 'react'
import { formatNumber } from './format'

// Quick hands-on jobs, a few seconds each.

// Fix the truck: tap the loose bolts before the time runs out.
export function FixTruckGame({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const BOLTS = 6
  const [bolts] = useState(() => Array.from({ length: BOLTS }, () => ({ x: 12 + Math.random() * 76, y: 18 + Math.random() * 60 })))
  const [tight, setTight] = useState<boolean[]>(() => Array(BOLTS).fill(false))
  const [left, setLeft] = useState(10)
  const done = tight.every(Boolean)
  useEffect(() => {
    if (done) {
      const t = setTimeout(onDone, 500)
      return () => clearTimeout(t)
    }
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left, done, onDone])
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl text-[#1d3a6e]">🔧 Fix the truck!</p>
          <p className={`font-display text-xl tabular-nums ${left <= 3 ? 'text-[#e23f3f]' : 'text-[#1d3a6e]'}`}>{done ? '✅' : `${left}s`}</p>
        </div>
        <p className="text-sm text-[#5b6f93]">Tap every loose bolt on the engine.</p>
        <div className="relative mt-3 h-56 overflow-hidden rounded-2xl bg-[#5b6470]">
          {/* The engine: blocky shapes behind the bolts. */}
          <div className="absolute inset-x-6 top-6 h-24 rounded-xl bg-[#3a3f47]" />
          <div className="absolute bottom-6 left-10 h-16 w-24 rounded-lg bg-[#2b2f35]" />
          <div className="absolute bottom-8 right-8 h-12 w-28 rounded-lg bg-[#d64545]" />
          {bolts.map((b, i) => (
            <button
              key={i}
              disabled={tight[i] || left <= 0}
              onClick={() => setTight((t) => t.map((v, k) => (k === i ? true : v)))}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 font-display text-lg transition-transform ${
                tight[i] ? 'scale-75 border-[#3fbf4a] bg-[#2a8a33] text-white' : 'animate-pulse border-[#f2c230] bg-[#9aa5b1] text-[#1d3a6e]'
              }`}
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
            >
              {tight[i] ? '✓' : '⚙'}
            </button>
          ))}
        </div>
        {left <= 0 && !done && (
          <div className="mt-3 flex gap-2">
            <button onClick={onCancel} className="flex-1 rounded-2xl bg-[#eef2f8] py-2 font-display text-[#1d3a6e]">
              Later
            </button>
            <button
              onClick={() => {
                setTight(Array(BOLTS).fill(false))
                setLeft(10)
              }}
              className="flex-1 rounded-2xl bg-[#ff6b1a] py-2 font-display text-white"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Bricks are falling: slide the skip under them for 15 seconds.
export function CatchBricksGame({ unit, onDone }: { unit: number; onDone: (caught: number) => void }) {
  const area = useRef<HTMLDivElement>(null)
  const [skipX, setSkipX] = useState(50)
  const skip = useRef(50)
  const [bricks, setBricks] = useState<{ id: number; x: number; y: number; v: number }[]>([])
  const [caught, setCaught] = useState(0)
  const [left, setLeft] = useState(15)
  const caughtRef = useRef(0)
  useEffect(() => {
    if (left <= 0) return
    let id = 0
    let last = performance.now()
    let spawn = 0
    let raf = 0
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      spawn -= dt
      setBricks((prev) => {
        const next: typeof prev = []
        for (const b of prev) {
          const y = b.y + b.v * dt
          if (y >= 86 && y < 94 && Math.abs(b.x - skip.current) < 12) {
            caughtRef.current++
            continue
          }
          if (y < 105) next.push({ ...b, y })
        }
        if (spawn <= 0) {
          spawn = 0.35 + Math.random() * 0.35
          next.push({ id: id++, x: 8 + Math.random() * 84, y: -5, v: 45 + Math.random() * 35 })
        }
        return next
      })
      setCaught(caughtRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const timer = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
    }
  }, [left <= 0]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once for the round
  const move = (clientX: number) => {
    const r = area.current?.getBoundingClientRect()
    if (!r) return
    const x = Math.max(8, Math.min(92, ((clientX - r.left) / r.width) * 100))
    skip.current = x
    setSkipX(x)
  }
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl text-[#1d3a6e]">🧱 Catch the bricks!</p>
          <p className="font-display text-xl tabular-nums text-[#1d3a6e]">{Math.max(0, left)}s</p>
        </div>
        <p className="text-sm text-[#5b6f93]">
          Slide the skip under them · {caught} caught = 🧱{formatNumber(caught * unit)}
        </p>
        <div
          ref={area}
          className="relative mt-3 h-72 touch-none overflow-hidden rounded-2xl bg-gradient-to-b from-[#9fd4ef] to-[#d9eef8]"
          onPointerMove={(e) => move(e.clientX)}
          onPointerDown={(e) => move(e.clientX)}
        >
          {bricks.map((b) => (
            <div key={b.id} className="absolute h-4 w-7 -translate-x-1/2 rounded-[3px] bg-[#c4553a] shadow-[0_2px_0_#8f3824]" style={{ left: `${b.x}%`, top: `${b.y}%` }} />
          ))}
          <div className="absolute bottom-2 h-7 w-[24%] -translate-x-1/2 rounded-b-xl rounded-t-sm border-[3px] border-[#1d5c2a] bg-[#3fbf4a]" style={{ left: `${skipX}%` }} />
          {left <= 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
              <p className="font-display text-3xl text-[#1d3a6e]">{caught} caught!</p>
              <button onClick={() => onDone(caught)} className="mt-3 rounded-2xl bg-[#3fbf4a] px-6 py-2 font-display text-lg text-white shadow-[0_4px_0_#2a8a33]">
                Collect 🧱{formatNumber(caught * unit)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
