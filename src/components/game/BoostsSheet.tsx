'use client'

import { X } from 'lucide-react'
import { AD_BOOST_MINUTES, BOOST_SECONDS, HELPERS, HELPER_MINUTES, type Engine, type Snapshot } from '@/lib/game/engine'
import RewardedAdButton from './RewardedAdButton'
import { Emo, IconText } from './Icons'
import { formatNumber } from './format'

function clock(s: number) {
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// Everything that speeds the site up: ad boosts, and packs of extra
// wrecking-ball swings and dynamite.
export default function BoostsSheet({ engine, snap, onClose }: { engine: Engine; snap: Snapshot; onClose: () => void }) {
  const crewOn = snap.boostLeft > BOOST_SECONDS
  const rows: { emoji: string; title: string; text: string; on: number | null; color: string; shade: string; onReward: () => void; label: string }[] = [
    {
      emoji: '⚡',
      title: '2× crew',
      text: `Your whole crew works twice as fast for ${AD_BOOST_MINUTES} minutes`,
      on: crewOn ? snap.boostLeft : null,
      color: '#3fbf4a',
      shade: '#2a8a33',
      onReward: () => engine.adBoost(),
      label: `▶ Watch · ${AD_BOOST_MINUTES} min`,
    },
    {
      emoji: '👷',
      title: `+${HELPERS} fast workers`,
      text: `${HELPERS} extra workers at double speed join for ${HELPER_MINUTES} minutes`,
      on: snap.helpersLeft > 0 ? snap.helpersLeft : null,
      color: '#2d7ff9',
      shade: '#1b5bbd',
      onReward: () => engine.adHelpers(),
      label: `▶ Watch · ${HELPER_MINUTES} min`,
    },
  ]
  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]"><Emo e="⚡" /> Boosts</p>
          <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
            <X className="h-5 w-5 text-[#1d3a6e]" />
          </button>
        </div>
        <p className="mb-1.5 font-display text-xs uppercase tracking-wide text-[#5b6f93]">Watch an ad</p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.title} className="flex items-center gap-3 rounded-2xl bg-[#eef2f8] p-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: r.color }}>
                <Emo e={r.emoji} size={28} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base leading-tight text-[#1d3a6e]">{r.title}</p>
                <p className="text-xs leading-tight text-[#5b6f93]">{r.text}</p>
              </div>
              {r.on !== null ? (
                <span className="shrink-0 rounded-xl bg-white px-3 py-2 font-display text-sm tabular-nums text-[#1d3a6e]">{clock(r.on)}</span>
              ) : (
                <RewardedAdButton
                  onReward={() => {
                    r.onReward()
                    engine.notify()
                  }}
                  className="shrink-0 rounded-xl px-3 py-2 font-display text-sm text-white active:translate-y-[3px] disabled:opacity-70"
                >
                  <span className="block rounded-xl px-1" style={{ background: r.color, boxShadow: `0 3px 0 ${r.shade}` }}>
                    <IconText text={r.label} />
                  </span>
                </RewardedAdButton>
              )}
            </div>
          ))}
        </div>
        <p className="mb-1.5 mt-4 font-display text-xs uppercase tracking-wide text-[#5b6f93]">Demolition tools</p>
        <div className="space-y-2">
          {(['ball', 'dynamite'] as const).map((kind) => {
            const pack = kind === 'ball' ? snap.tools.ballPack : snap.tools.dynamitePack
            const charges = kind === 'ball' ? snap.tools.ballCharges : snap.tools.dynamiteCharges
            const wait = kind === 'ball' ? snap.tools.ballIn : snap.tools.dynamiteIn
            return (
              <div key={kind} className="rounded-2xl bg-[#eef2f8] p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1d3a6e] text-2xl"><IconText text={kind === 'ball' ? '🏗️' : '🧨'} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight text-[#1d3a6e]">
                      {kind === 'ball' ? 'Wrecking ball' : 'Dynamite'} <span className="text-sm text-[#5b6f93]">×{charges} saved</span>
                    </p>
                    <p className="text-xs leading-tight text-[#5b6f93]">
                      {wait > 0 ? `Free again in ${clock(wait)}` : 'Ready — use it above BREAK!'} · saved ones skip the wait
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  {(['gems', 'bricks'] as const).map((pay) => (
                    <button
                      key={pay}
                      disabled={pay === 'gems' ? snap.gems < pack.gems : snap.scrap < pack.bricks}
                      onClick={() => {
                        engine.buyToolPack(kind, pay)
                        engine.notify()
                      }}
                      className="flex-1 rounded-xl bg-[#ff6b1a] py-2 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                    >
                      <IconText text={`+3 for ${pay === 'gems' ? `💎 ${pack.gems}` : `🧱 ${formatNumber(pack.bricks)}`}`} />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
