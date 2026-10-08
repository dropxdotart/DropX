'use client'

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

// A little head-and-shoulders portrait drawn from a manager's look.
export function Portrait({ look, size = 56, dim = false }: { look: Look; size?: number; dim?: boolean }) {
  const u = size / 14
  const hat = look.hat
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl bg-[#cfe6f5]" style={{ width: size, height: size, filter: dim ? 'brightness(0)' : undefined, opacity: dim ? 0.35 : 1 }}>
      <div className="absolute" style={{ left: 2 * u, right: 2 * u, bottom: 0, height: 4 * u, background: look.robe ?? look.vest ?? look.top, borderRadius: `${u}px ${u}px 0 0` }} />
      {look.under && <div className="absolute" style={{ left: 6 * u, width: 2 * u, bottom: 3 * u, height: u, background: look.under }} />}
      <div className="absolute" style={{ left: 3.5 * u, width: 7 * u, top: 3 * u, height: 7 * u, background: look.skin, borderRadius: u * 0.6 }} />
      <div className="absolute" style={{ left: 3.5 * u, width: 7 * u, top: 3 * u, height: 1.3 * u, background: look.hair, borderRadius: `${u * 0.6}px ${u * 0.6}px 0 0` }} />
      {look.payos &&
        [3.1, 10.2].map((l) => <div key={l} className="absolute" style={{ left: l * u, width: 0.8 * u, top: 5 * u, height: 4 * u, background: look.hair, borderRadius: u }} />)}
      {[5.2, 7.8].map((l) => (
        <div key={l} className="absolute" style={{ left: l * u, width: u, top: 6 * u, height: 1.2 * u, background: '#2a1d14' }} />
      ))}
      {look.glasses &&
        [4.7, 7.3].map((l) => <div key={l} className="absolute rounded-full" style={{ left: l * u, width: 2 * u, top: 5.6 * u, height: 2 * u, border: `${Math.max(1, u * 0.3)}px solid #141414` }} />)}
      <div className="absolute" style={{ left: 6 * u, width: 2 * u, top: 8.4 * u, height: 0.5 * u, background: '#9a4a3a' }} />
      {hat === 'kippah' && <div className="absolute" style={{ left: 5 * u, width: 4 * u, top: 1.8 * u, height: 1.6 * u, background: look.hatColor, borderRadius: `${2 * u}px ${2 * u}px 0 0` }} />}
      {hat === 'fedora' && (
        <>
          <div className="absolute" style={{ left: 2 * u, width: 10 * u, top: 3 * u, height: 0.8 * u, background: look.hatColor, borderRadius: u }} />
          <div className="absolute" style={{ left: 4 * u, width: 6 * u, top: 0.6 * u, height: 2.8 * u, background: look.hatColor, borderRadius: `${u}px ${u}px 0 0` }} />
        </>
      )}
      {(hat === 'hardhat' || hat === 'cap') && (
        <div className="absolute" style={{ left: 3 * u, width: 8 * u, top: 1.4 * u, height: 2.2 * u, background: look.hatColor, borderRadius: hat === 'hardhat' ? `${4 * u}px ${4 * u}px 0 0` : `${u}px ${u}px 0 0` }} />
      )}
      {hat === 'hood' && <div className="absolute" style={{ left: 2.6 * u, width: 8.8 * u, top: 2 * u, height: 9 * u, border: `${u}px solid ${look.hatColor}`, borderBottom: 'none', borderRadius: `${3 * u}px ${3 * u}px 0 0` }} />}
    </div>
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
      <div className="chest-pop mb-4 flex h-24 w-28 items-end justify-center rounded-2xl border-4 text-5xl" style={{ background: c.color, borderColor: c.trim }}>
        <span className="mb-2">🗝️</span>
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
      <p className="mt-4 font-display text-lg text-[#9fe0ff]">+{result.gems} 💎</p>
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
            <span className="rounded-full bg-[#e6f6ff] px-2.5 py-1 font-display text-sm text-[#1b6fa8]">💎 {formatNumber(snap.gems)}</span>
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
              {t === 'boss' ? '😎 Boss' : t}
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
                        {m.automation && <p className="text-[11px] leading-tight text-[#5b6f93]">🤖 {m.automation.map((a) => AUTO_NAMES[a]).join(' · ')}</p>}
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
                      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-2xl">➕</span>
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
                <p className="font-display text-base text-[#1d3a6e]">🎁 Free chest</p>
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
                  <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl border-[3px] text-2xl" style={{ background: c.color, borderColor: c.trim }}>
                    🧰
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight text-[#1d3a6e]">
                      {c.name} <span className="text-sm text-[#5b6f93]">×{n}</span>
                    </p>
                    <p className="text-[11px] leading-tight text-[#5b6f93]">
                      {c.cards} cards · {c.odds.epic + c.odds.legendary}% Epic or better · {c.gems[0]}–{c.gems[1]} 💎
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
                        Buy 🧱{formatNumber(snap.ironChestPrice)}
                      </button>
                    )}
                    {type === 'gold' && (
                      <button
                        disabled={snap.gems < GOLD_CHEST_GEMS}
                        onClick={() => act(engine.buyChest('gold'))}
                        className="rounded-lg bg-white px-2 py-1 font-display text-xs text-[#1d3a6e] disabled:opacity-50"
                      >
                        Buy 💎{GOLD_CHEST_GEMS}
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
                          ▶ +1 for an ad
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
                      {own.cards}/{need} · 🧱{formatNumber(levelUpCost(m, own.level))}
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
                😎 The Boss is a <b>Legendary</b> manager — find him in chests. Outfits you buy now are ready when he joins.
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
                    <span className="font-display text-xs text-[#5b6f93]">{on ? 'Wearing' : owned ? 'Wear' : `💎 ${o.gems}`}</span>
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
