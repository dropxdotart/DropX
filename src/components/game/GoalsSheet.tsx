'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Engine, Snapshot } from '@/lib/game/engine'

// Today's three goals (gems each, a chest for all three) and the current
// contract (a bigger job for a better chest).
export default function GoalsSheet({ engine, snap, onClose }: { engine: Engine; snap: Snapshot; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const act = (err: string | null) => {
    setError(err)
    engine.notify()
  }
  const c = snap.contract
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">🎯 Goals</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>
        {error && <p className="mb-2 rounded-xl bg-[#ffe3e3] p-2 text-center text-sm text-[#c23030]">{error}</p>}
        <p className="mb-1.5 font-display text-xs uppercase tracking-wide text-[#5b6f93]">Today · new goals every day</p>
        <div className="space-y-2">
          {snap.goals.map((g, i) => {
            const done = g.progress >= g.target
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-[#eef2f8] p-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-display text-sm leading-tight ${g.claimed ? 'text-[#8a94a6] line-through' : 'text-[#1d3a6e]'}`}>{g.text}</p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#d5ddea]">
                    <div className="h-full rounded-full bg-[#3fbf4a]" style={{ width: `${Math.min(100, (g.progress / g.target) * 100)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[11px] tabular-nums text-[#5b6f93]">
                    {g.progress.toLocaleString()} / {g.target.toLocaleString()}
                  </p>
                </div>
                {g.claimed ? (
                  <span className="font-display text-sm text-[#2a9a3a]">✓</span>
                ) : (
                  <button
                    disabled={!done}
                    onClick={() => act(engine.claimGoal(i))}
                    className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                  >
                    💎 {g.gems}
                  </button>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff4d6] p-3">
            <p className="font-display text-sm text-[#1d3a6e]">All three done: 🧰 Iron chest</p>
            {snap.goalsBonusClaimed ? (
              <span className="font-display text-sm text-[#2a9a3a]">✓</span>
            ) : (
              <button
                disabled={!snap.goalsBonusReady}
                onClick={() => act(engine.claimGoalBonus())}
                className="shrink-0 rounded-xl bg-[#ff6b1a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
              >
                Claim
              </button>
            )}
          </div>
        </div>
        {c && (
          <>
            <p className="mb-1.5 mt-4 font-display text-xs uppercase tracking-wide text-[#5b6f93]">Contract</p>
            <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#c9d3e3] p-3">
              <span className="text-3xl">📜</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">
                  Demolish {c.target} × {c.name}
                </p>
                <p className="text-xs text-[#5b6f93]">
                  Reward: {c.chest === 'gold' ? 'Gold' : 'Iron'} chest + 💎{c.gems} · {c.progress}/{c.target}
                </p>
              </div>
              <button
                disabled={c.progress < c.target}
                onClick={() => act(engine.claimContract())}
                className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
              >
                Claim
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
