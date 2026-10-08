'use client'

import { Chest, Emo, IconText } from './Icons'
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Engine, Snapshot } from '@/lib/game/engine'
import {
  ABILITIES,
  CHESTS,
  GOLD_CHEST_GEMS,
  MANAGERS,
  MAX_MANAGER_LEVEL,
  OUTFITS,
  RARITY,
  STATION_STATS,
  boostsAt,
  cardsToLevel,
  fits,
  levelUpCost,
  manager,
  outfitLook,
  slotKind,
  type ChestType,
  type Look,
  type ManagerDef,
  type Pull,
  type Slot,
} from '@/lib/game/managers'
import { ISLANDS } from '@/lib/game/islands'
import { formatNumber } from './format'
import RewardedAdButton from './RewardedAdButton'

const STAT_NAMES: Record<string, string> = {
  walk: 'Walk speed',
  pick: 'Work speed',
  truckSpeed: 'Truck speed',
  truckLoad: 'Truck load',
  unload: 'Unloading',
  pay: 'Brick pay',
  dumpster: 'Dumpster size',
}
const AUTO_NAMES: Record<string, string> = {
  claim: 'Claims cleared sites',
  restart: 'Starts the next building',
  upgrade: 'Buys small upgrades',
  empty: 'Empties dumpsters',
}

const STATION_LABEL: Record<string, string> = { crew: 'Crew', truck: 'Trucks', yard: 'Any yard', dumpster: 'Dumpsters', tools: 'Tools', any: 'Any station' }

export function slotName(slot: Slot) {
  if (slot === 'crew') return 'Crew'
  if (slot === 'truck') return 'Trucks'
  if (slot === 'dumpster') return 'Dumpsters'
  if (slot === 'tools') return 'Tools'
  return ISLANDS[Number(slot.slice(4))]?.yard.name ?? 'Yard'
}

function clock(s: number) {
  if (s <= 0) return 'Ready'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`
}

// A cartoon head-and-shoulders portrait drawn from a manager's look:
// outlined, with ears, rosy cheeks, shiny eyes and their hat, collar,
// vest or robe.
export function Portrait({ look, size = 56, dim = false }: { look: Look; size?: number; dim?: boolean }) {
  const O = '#1d3a6e'
  const sw = 1.4
  const hat = look.hat
  const body = look.robe ?? look.top
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="shrink-0 rounded-xl bg-[#cfe6f5]"
      style={{ filter: dim ? 'brightness(0)' : undefined, opacity: dim ? 0.3 : 1 }}
      aria-hidden
    >
      {/* Shoulders */}
      <path d="M8 64 Q9 47 24 45 H40 Q55 47 56 64 Z" fill={body} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
      {look.topPattern === 'plaid' && <path d="M17 49 V64 M47 49 V64 M10 56 H54" stroke="#c8d2eb" strokeWidth={0.6} opacity={0.7} />}
      {look.vest && (
        <>
          <path d="M14 64 Q15 50 26 47 L32 56 L38 47 Q49 50 50 64 Z" fill={look.vest} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M15 58 H49" stroke="#e8eef2" strokeWidth={2.2} />
        </>
      )}
      {look.under && <path d="M26 45 L32 54 L38 45 Z" fill={look.under} stroke={O} strokeWidth={1} strokeLinejoin="round" />}
      {/* Lapels for jackets and robes */}
      {(look.topPattern === 'plaid' || look.robe) && <path d="M25 46 L30 57 M39 46 L34 57" stroke={O} strokeWidth={1.2} strokeLinecap="round" />}
      {look.tie && <path d="M31 50 H33 L34 60 L32 63 L30 60 Z" fill={look.tie[0]} stroke={O} strokeWidth={0.8} />}
      {/* Neck, ears, head */}
      <rect x="27.5" y="38" width="9" height="8" fill={look.skin} stroke={O} strokeWidth={sw} />
      <circle cx="18" cy="28" r="3.6" fill={look.skin} stroke={O} strokeWidth={sw} />
      <circle cx="46" cy="28" r="3.6" fill={look.skin} stroke={O} strokeWidth={sw} />
      <rect x="18" y="12" width="28" height="30" rx="10" fill={look.skin} stroke={O} strokeWidth={sw} />
      {/* Hair */}
      {hat !== 'hood' && <path d="M18.5 24 Q17 11 32 10.5 Q47 11 45.5 24 Q42 17 32 17 Q22 17 18.5 24 Z" fill={look.hair} stroke={O} strokeWidth={sw} strokeLinejoin="round" />}
      {look.payos &&
        [17.5, 46.5].map((x) => (
          <path key={x} d={`M${x} 26 q${x < 32 ? -2.5 : 2.5} 3 0 6 q${x < 32 ? 2.5 : -2.5} 3 0 6 q${x < 32 ? -2.5 : 2.5} 2.5 0 5`} fill="none" stroke={look.hair} strokeWidth={2.6} strokeLinecap="round" />
        ))}
      {/* Face */}
      <circle cx="23.5" cy="33" r="2.6" fill="#ff9a9a" opacity={0.45} />
      <circle cx="40.5" cy="33" r="2.6" fill="#ff9a9a" opacity={0.45} />
      <path d="M23 24.5 Q26 22.8 29 24.3 M35 24.3 Q38 22.8 41 24.5" fill="none" stroke={look.hair} strokeWidth={1.6} strokeLinecap="round" />
      {[26.5, 37.5].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={28.5} rx={2.2} ry={2.7} fill="#2a1d14" />
          <circle cx={x + 0.8} cy={27.6} r={0.8} fill="#ffffff" />
        </g>
      ))}
      <path d="M31 31 Q32.5 33 31.5 34" fill="none" stroke="#c98a6a" strokeWidth={1.1} strokeLinecap="round" />
      <path d="M27 36.5 Q32 40.5 37 36.5" fill="#ffffff" stroke={O} strokeWidth={1.2} strokeLinejoin="round" />
      {look.glasses && (
        <g fill="none" stroke="#141414" strokeWidth={1.4}>
          <circle cx="26.5" cy="28.5" r="4.2" />
          <circle cx="37.5" cy="28.5" r="4.2" />
          <path d="M30.7 28.2 H33.3" />
        </g>
      )}
      {/* Headwear */}
      {hat === 'kippah' && <path d="M24 13.5 Q32 6.5 40 13.5 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />}
      {hat === 'fedora' && (
        <>
          <path d="M9 17 Q32 22 55 17 Q53 13.5 32 14.5 Q11 13.5 9 17 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M19 15 Q19 4 32 4 Q45 4 45 15 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M19.5 12.5 Q32 15 44.5 12.5" stroke="#3a3a3e" strokeWidth={2.4} fill="none" />
        </>
      )}
      {hat === 'flatcap' && (
        <>
          <path d="M17 18 Q16 8 32 8 Q48 8 47 18 Q32 14 17 18 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M28 16.5 Q40 15 50 19 Q44 21.5 32 19.5 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
        </>
      )}
      {hat === 'wizard' && (
        <>
          <path d="M8 18 Q32 23 56 18 Q54 14 32 15 Q10 14 8 18 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M20 16 L34 1 L44 16 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
          <path d="M33 7 l1 2 2 .3 -1.5 1.4 .4 2 -1.9 -1 -1.9 1 .4 -2 -1.5 -1.4 2 -.3 Z" fill="#e3b33c" />
        </>
      )}
      {(hat === 'hardhat' || hat === 'cap') && (
        <>
          {hat === 'hardhat' ? (
            <>
              <path d="M16 19 Q16 5 32 5 Q48 5 48 19 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
              <rect x="12" y="17.5" width="40" height="4" rx="2" fill={look.hatColor} stroke={O} strokeWidth={sw} />
              <path d="M32 5.5 V17" stroke={O} strokeWidth={1} opacity={0.5} />
            </>
          ) : (
            <>
              <path d="M17 18 Q17 6 32 6 Q47 6 47 18 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
              <path d="M30 17 Q44 15 52 19.5 Q44 22 30 19.5 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />
            </>
          )}
        </>
      )}
      {hat === 'hood' && <path d="M14 44 Q10 10 32 8 Q54 10 50 44 Q47 22 32 20 Q17 22 14 44 Z" fill={look.hatColor} stroke={O} strokeWidth={sw} strokeLinejoin="round" />}
    </svg>
  )
}

const lookOf = (m: ManagerDef, snap: Snapshot) => (m.id === 'boss' ? outfitLook(snap.outfit) : m.look)

function boostText(m: ManagerDef, level: number, slot: Slot) {
  const b = boostsAt(m, level, slot)
  return Object.entries(b)
    .map(([k, v]) => `${STAT_NAMES[k]} +${Math.round(((v ?? 1) - 1) * 100)}%`)
    .join(' · ')
}

function RarityChip({ m }: { m: ManagerDef }) {
  const r = RARITY[m.rarity]
  return (
    <span className="rounded-full px-1.5 py-0.5 font-display text-[10px] uppercase leading-none tracking-wide text-white" style={{ background: r.color }}>
      {r.name}
    </span>
  )
}

// ── Chest opening ─────────────────────────────────────────────────────

function ChestReveal({ type, result, snap, onDone }: { type: ChestType; result: { pulls: (Pull & { isNew: boolean })[]; gems: number }; snap: Snapshot; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const c = CHESTS[type]
  const all = shown >= result.pulls.length
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1a33] p-6"
      onClick={(e) => {
        e.stopPropagation()
        if (all) onDone()
        else setShown((n) => n + 1)
      }}
    >
      <div className="chest-pop mb-4">
        <Chest type={type} size={110} />
      </div>
      <p className="mb-3 font-display text-2xl text-white">{c.name}</p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        {result.pulls.map((p, i) => {
          const m = manager(p.manager)!
          const r = RARITY[m.rarity]
          const open = i < shown
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-2xl border-[3px] p-2 transition-all duration-300 ${open ? 'scale-100 opacity-100' : 'scale-90 opacity-40'}`}
              style={{ borderColor: open ? r.color : '#3a4a6a', background: open ? '#ffffff' : '#22314f' }}
            >
              {open ? <Portrait look={lookOf(m, snap)} size={44} /> : <div className="h-11 w-11 rounded-xl bg-[#33456b]" />}
              <div className="min-w-0">
                {open ? (
                  <>
                    <p className="truncate font-display text-sm leading-tight text-[#1d3a6e]">{m.name}</p>
                    <p className="text-[10px] font-bold uppercase" style={{ color: r.dark }}>
                      {p.isNew ? 'New!' : '+1 card'}
                    </p>
                  </>
                ) : (
                  <p className="font-display text-sm text-white/60">?</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 font-display text-lg text-[#9fe0ff]">+{result.gems} <Emo e="💎" /></p>
      <p className="mt-2 text-sm text-white/70">{all ? 'Tap to close' : 'Tap to reveal'}</p>
    </div>
  )
}

// ── The sheet ─────────────────────────────────────────────────────────

type Tab = 'team' | 'chests' | 'collection' | 'boss'

export default function ManagersSheet({ engine, snap, focusSlot, onClose }: { engine: Engine; snap: Snapshot; focusSlot: Slot | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(focusSlot ? 'team' : snap.chests.wood + snap.chests.iron + snap.chests.gold > 0 || snap.freeChestIn === 0 ? 'chests' : 'team')
  const [picking, setPicking] = useState<Slot | null>(focusSlot && !snap.assigned[focusSlot] ? focusSlot : null)
  const [reveal, setReveal] = useState<{ type: ChestType; result: { pulls: (Pull & { isNew: boolean })[]; gems: number } } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const slots = engine.managerSlots()
  const act = (err: string | null | boolean) => {
    setError(typeof err === 'string' ? err : null)
    engine.notify()
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-2xl text-[#1d3a6e]">Your team</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#e6f6ff] px-2.5 py-1 font-display text-sm text-[#1b6fa8]"><Emo e="💎" /> {formatNumber(snap.gems)}</span>
            <button onClick={onClose} className="rounded-full bg-[#eef2f8] p-2" aria-label="Close">
              <X className="h-5 w-5 text-[#1d3a6e]" />
            </button>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-[#eef2f8] p-1">
          {(['team', 'chests', 'collection', 'boss'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setPicking(null)
              }}
              className={`rounded-xl py-1.5 font-display text-sm capitalize ${tab === t ? 'bg-white text-[#1d3a6e] shadow' : 'text-[#5b6f93]'}`}
            >
              <IconText text={t === 'boss' ? '😎 Boss' : t} />
            </button>
          ))}
        </div>
        {error && <p className="mb-2 rounded-xl bg-[#ffe3e3] p-2 text-center text-sm text-[#c23030]">{error}</p>}

        {tab === 'team' && !picking && (
          <div className="space-y-2">
            {slots.map((slot) => {
              const id = snap.assigned[slot]
              const m = id ? manager(id) : null
              const own = id ? snap.managers[id] : null
              const ab = m?.ability ? ABILITIES[m.ability] : null
              const st = snap.abilities[slot]
              return (
                <div key={slot} className={`rounded-2xl p-3 ${focusSlot === slot ? 'bg-[#fff4d6]' : 'bg-[#eef2f8]'}`}>
                  <p className="mb-1.5 font-display text-xs uppercase tracking-wide text-[#5b6f93]">{slotName(slot)}</p>
                  {m && own ? (
                    <div className="flex items-center gap-3">
                      <Portrait look={lookOf(m, snap)} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-display text-base leading-tight text-[#1d3a6e]">
                          {m.name} <span className="text-xs text-[#5b6f93]">Lv {own.level}</span> <RarityChip m={m} />
                        </p>
                        <p className="text-xs leading-tight text-[#2a9a3a]">{boostText(m, own.level, slot)}</p>
                        {m.automation && <p className="text-[11px] leading-tight text-[#5b6f93]"><Emo e="🤖" /> {m.automation.map((a) => AUTO_NAMES[a]).join(' · ')}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {ab && (
                          <button
                            disabled={!st || st.readyIn > 0 || st.activeLeft > 0}
                            onClick={() => act(engine.useAbility(slot))}
                            className="rounded-xl bg-[#ff6b1a] px-2.5 py-1.5 font-display text-xs text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                            title={ab.text}
                          >
                            {ab.emoji} {st?.activeLeft ? `${st.activeLeft}s` : st && st.readyIn > 0 ? clock(st.readyIn) : ab.name}
                          </button>
                        )}
                        <button onClick={() => setPicking(slot)} className="rounded-lg bg-white px-2 py-1 font-display text-xs text-[#1d3a6e]">
                          Swap
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPicking(slot)} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-[#c9d3e3] p-2 text-left">
                      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-2xl"><Emo e="➕" /></span>
                      <span className="text-sm text-[#5b6f93]">No manager — tap to put one in charge ({STATION_STATS[slotKind(slot)].map((k) => STAT_NAMES[k]).join(', ')})</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'team' && picking && (
          <div className="space-y-2">
            <button onClick={() => setPicking(null)} className="mb-1 font-display text-sm text-[#2d7ff9]">
              ← {slotName(picking)}
            </button>
            {MANAGERS.filter((m) => snap.managers[m.id] && fits(m, picking)).map((m) => {
              const own = snap.managers[m.id]
              const where = (Object.entries(snap.assigned) as [Slot, string][]).find(([, v]) => v === m.id)?.[0]
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    act(engine.assignManager(picking, m.id))
                    setPicking(null)
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[#eef2f8] p-2 text-left"
                >
                  <Portrait look={lookOf(m, snap)} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-display text-base text-[#1d3a6e]">
                      {m.name} <span className="text-xs text-[#5b6f93]">Lv {own.level}</span> <RarityChip m={m} />
                    </span>
                    <span className="block text-xs text-[#2a9a3a]">{boostText(m, own.level, picking)}</span>
                    {where && where !== picking && <span className="block text-[11px] text-[#c2410c]">Moves here from {slotName(where)}</span>}
                  </span>
                </button>
              )
            })}
            {snap.assigned[picking] && (
              <button
                onClick={() => {
                  act(engine.assignManager(picking, null))
                  setPicking(null)
                }}
                className="w-full rounded-2xl bg-[#ffe3e3] p-2 font-display text-sm text-[#c23030]"
              >
                Leave this station empty
              </button>
            )}
            {!MANAGERS.some((m) => snap.managers[m.id] && fits(m, picking)) && (
              <p className="rounded-2xl bg-[#eef2f8] p-3 text-center text-sm text-[#5b6f93]">No one for this station yet — open chests to hire managers.</p>
            )}
          </div>
        )}

        {tab === 'chests' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff4d6] p-3">
              <div>
                <p className="font-display text-base text-[#1d3a6e]"><Emo e="🎁" /> Free chest</p>
                <p className="text-xs text-[#5b6f93]">A Wooden chest every 4 hours</p>
              </div>
              <button
                disabled={snap.freeChestIn > 0}
                onClick={() => act(engine.claimFreeChest())}
                className="shrink-0 rounded-xl bg-[#3fbf4a] px-3 py-2 font-display text-sm text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
              >
                {snap.freeChestIn > 0 ? clock(snap.freeChestIn) : 'Claim'}
              </button>
            </div>
            {(['wood', 'iron', 'gold'] as ChestType[]).map((type) => {
              const c = CHESTS[type]
              const n = snap.chests[type]
              return (
                <div key={type} className="flex items-center gap-3 rounded-2xl bg-[#eef2f8] p-3">
                  <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-white">
                    <Chest type={type} size={42} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight text-[#1d3a6e]">
                      {c.name} <span className="text-sm text-[#5b6f93]">×{n}</span>
                    </p>
                    <p className="text-[11px] leading-tight text-[#5b6f93]">
                      {c.cards} cards · {c.odds.epic + c.odds.legendary}% Epic or better · {c.gems[0]}–{c.gems[1]} <Emo e="💎" />
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {n > 0 && (
                      <button
                        onClick={() => {
                          const result = engine.openChest(type)
                          engine.notify()
                          if (result) setReveal({ type, result })
                        }}
                        className="rounded-xl bg-[#ff6b1a] px-3 py-1.5 font-display text-sm text-white shadow-[0_3px_0_#c94e0a] active:translate-y-[3px] active:shadow-none"
                      >
                        Open
                      </button>
                    )}
                    {type === 'iron' && (
                      <button
                        disabled={snap.scrap < snap.ironChestPrice}
                        onClick={() => act(engine.buyChest('iron'))}
                        className="rounded-lg bg-white px-2 py-1 font-display text-xs text-[#1d3a6e] disabled:opacity-50"
                      >
                        Buy <Emo e="🧱" />{formatNumber(snap.ironChestPrice)}
                      </button>
                    )}
                    {type === 'gold' && (
                      <button
                        disabled={snap.gems < GOLD_CHEST_GEMS}
                        onClick={() => act(engine.buyChest('gold'))}
                        className="rounded-lg bg-white px-2 py-1 font-display text-xs text-[#1d3a6e] disabled:opacity-50"
                      >
                        Buy <Emo e="💎" />{GOLD_CHEST_GEMS}
                      </button>
                    )}
                    {type === 'wood' &&
                      (snap.adChestIn > 0 ? (
                        <span className="font-display text-[11px] text-[#5b6f93]">Ad chest in {clock(snap.adChestIn)}</span>
                      ) : (
                        <RewardedAdButton
                          onReward={() => act(engine.adChest())}
                          className="rounded-lg bg-[#3fbf4a] px-2 py-1 font-display text-xs text-white disabled:opacity-60"
                        >
                          <Emo e="▶" /> +1 for an ad
                        </RewardedAdButton>
                      ))}
                  </div>
                </div>
              )
            })}
            <p className="px-1 text-center text-[11px] text-[#5b6f93]">Chests also come from levelling up — and sometimes one falls off a passing truck!</p>
          </div>
        )}

        {tab === 'collection' && (
          <div className="grid grid-cols-1 gap-2">
            {MANAGERS.map((m) => {
              const own = snap.managers[m.id]
              const need = own ? cardsToLevel(m, own.level) : 0
              const maxed = own && own.level >= MAX_MANAGER_LEVEL
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-[#eef2f8] p-2.5">
                  <Portrait look={lookOf(m, snap)} size={48} dim={!own} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-display text-base leading-tight text-[#1d3a6e]">
                      {own ? m.name : '???'} {own && <span className="text-xs text-[#5b6f93]">Lv {own.level}</span>} <RarityChip m={m} />
                    </p>
                    <p className="text-[11px] leading-tight text-[#5b6f93]">
                      {m.title} · {STATION_LABEL[m.station]}
                      {m.ability && ` · ${ABILITIES[m.ability].emoji} ${ABILITIES[m.ability].name}`}
                    </p>
                    {own && !maxed && (
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#d5ddea]">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (own.cards / need) * 100)}%`, background: RARITY[m.rarity].color }} />
                      </div>
                    )}
                  </div>
                  {own && !maxed && (
                    <button
                      disabled={own.cards < need || snap.scrap < levelUpCost(m, own.level)}
                      onClick={() => act(engine.levelUpManager(m.id))}
                      className="shrink-0 rounded-xl bg-[#3fbf4a] px-2.5 py-1.5 font-display text-xs text-white shadow-[0_3px_0_#2a8a33] active:translate-y-[3px] active:shadow-none disabled:bg-[#b9c2cf] disabled:shadow-[0_3px_0_#97a1ae]"
                    >
                      {own.cards}/{need} · <Emo e="🧱" />{formatNumber(levelUpCost(m, own.level))}
                    </button>
                  )}
                  {maxed && <span className="font-display text-xs text-[#c98a10]">MAX</span>}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'boss' && (
          <div className="space-y-2">
            {!snap.managers.boss && (
              <p className="rounded-2xl bg-[#fff4d6] p-3 text-center text-sm text-[#8a5a00]">
                <Emo e="😎" /> The Boss is a <b>Legendary</b> manager — find him in chests. Outfits you buy now are ready when he joins.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {OUTFITS.map((o) => {
                const owned = snap.outfits.includes(o.id)
                const on = snap.outfit === o.id
                return (
                  <button
                    key={o.id}
                    onClick={() => act(engine.buyOutfit(o.id))}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-[3px] p-2 ${on ? 'border-[#f2b230] bg-[#fff4d6]' : 'border-transparent bg-[#eef2f8]'}`}
                  >
                    <Portrait look={outfitLook(o.id)} size={64} />
                    <span className="font-display text-sm text-[#1d3a6e]">{o.name}</span>
                    <span className="font-display text-xs text-[#5b6f93]"><IconText text={on ? 'Wearing' : owned ? 'Wear' : `💎 ${o.gems}`} /></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {reveal && <ChestReveal type={reveal.type} result={reveal.result} snap={snap} onDone={() => setReveal(null)} />}
    </div>
  )
}
