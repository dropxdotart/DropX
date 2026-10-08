// Managers: characters you collect from chests and put in charge of a
// station (one each: the crew, the trucks, each yard, the dumpsters, the
// tools). A manager walks around their station and
//   - boosts it (a percentage that grows with their level),
//   - may run part of it for you (automation),
//   - may have a special ability you tap to use, with a cooldown.
// Duplicate cards from chests level a manager up (plus some bricks).
//
// The Boss — the Legendary manager — is the player's own character: he
// works any station, with the biggest boost and the Boss Mode ability.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type StationKind = 'crew' | 'truck' | 'yard' | 'dumpster' | 'tools'
// A slot: a station, or a particular island's yard.
export type Slot = 'crew' | 'truck' | 'dumpster' | 'tools' | `yard${number}`

export const slotKind = (slot: Slot): StationKind => (slot.startsWith('yard') ? 'yard' : (slot as StationKind))

// What a boost multiplies.
export type BoostStat = 'walk' | 'pick' | 'truckSpeed' | 'truckLoad' | 'unload' | 'pay' | 'dumpster'

export type Automation = 'claim' | 'restart' | 'upgrade' | 'empty'
export type AbilityId = 'rally' | 'express' | 'market' | 'emptyAll' | 'charge' | 'bossMode'

export type Ability = { id: AbilityId; name: string; emoji: string; text: string; seconds: number; cooldownMinutes: number }

export const ABILITIES: Record<AbilityId, Ability> = {
  rally: { id: 'rally', name: 'Rally the crew', emoji: '📣', text: 'Crew works 3× faster', seconds: 45, cooldownMinutes: 10 },
  express: { id: 'express', name: 'Express run', emoji: '💨', text: 'Trucks drive 3× faster', seconds: 60, cooldownMinutes: 10 },
  market: { id: 'market', name: 'Market day', emoji: '💰', text: 'Bricks pay double', seconds: 60, cooldownMinutes: 15 },
  emptyAll: { id: 'emptyAll', name: 'Empty them all', emoji: '🗑️', text: 'Every dumpster hauled away and paid now', seconds: 0, cooldownMinutes: 15 },
  charge: { id: 'charge', name: 'Demolition charge', emoji: '🧨', text: 'Blasts a chunk off every building', seconds: 0, cooldownMinutes: 15 },
  bossMode: { id: 'bossMode', name: 'Boss Mode', emoji: '😎', text: 'Everything runs 3× faster', seconds: 60, cooldownMinutes: 15 },
}

// How a person looks (see Person.tsx). Managers wear one fixed look; the
// Boss's look is the outfit the player picks.
export type Look = {
  skin: string
  hair: string
  hat: 'hardhat' | 'cap' | 'kippah' | 'fedora' | 'hood' | 'none'
  hatColor: string
  top: string // shirt / jacket
  topPattern?: 'plaid' | 'stripe'
  under?: string // shirt showing at the collar
  vest?: string // hi-vis vest
  legs: string
  shoes: string
  payos?: boolean
  glasses?: boolean
  tie?: [string, string]
  robe?: string // a long robe over everything (wizard)
  item?: 'clipboard' | 'radio' | 'wrench' | 'none'
}

export type ManagerDef = {
  id: string
  name: string
  title: string
  rarity: Rarity
  station: StationKind | 'any'
  boost: { stat: BoostStat; base: number; perLevel: number }[] // +base% at level 1, +perLevel% each level after
  automation?: Automation[]
  ability?: AbilityId
  look: Look
}

const vest = '#ff7a1a'

export const MANAGERS: ManagerDef[] = [
  // Crew
  {
    id: 'dan',
    name: 'Dan',
    title: 'Foreman',
    rarity: 'common',
    station: 'crew',
    boost: [{ stat: 'walk', base: 10, perLevel: 3 }],
    automation: ['claim'],
    look: { skin: '#e8b48f', hair: '#6b4a2b', hat: 'hardhat', hatColor: '#f2c230', top: '#3f6fb5', vest, legs: '#2d3e57', shoes: '#3a2a1a', item: 'clipboard' },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    title: 'Site Supervisor',
    rarity: 'rare',
    station: 'crew',
    boost: [
      { stat: 'walk', base: 12, perLevel: 3 },
      { stat: 'pick', base: 12, perLevel: 3 },
    ],
    automation: ['claim', 'restart'],
    look: { skin: '#c98c64', hair: '#2b1d14', hat: 'hardhat', hatColor: '#ffffff', top: '#d64545', vest, legs: '#24365a', shoes: '#2b2b2e', item: 'radio' },
  },
  {
    id: 'tony',
    name: 'Tony',
    title: 'Crew Chief',
    rarity: 'epic',
    station: 'crew',
    boost: [
      { stat: 'walk', base: 20, perLevel: 4 },
      { stat: 'pick', base: 20, perLevel: 4 },
    ],
    automation: ['claim', 'restart'],
    ability: 'rally',
    look: { skin: '#f0c7a0', hair: '#1a1a1a', hat: 'hardhat', hatColor: '#ff6b1a', top: '#2b2b2e', vest: '#f2c230', legs: '#3a3a3e', shoes: '#2b2b2e', item: 'radio' },
  },
  // Trucks
  {
    id: 'sam',
    name: 'Sam',
    title: 'Dispatcher',
    rarity: 'common',
    station: 'truck',
    boost: [{ stat: 'truckSpeed', base: 10, perLevel: 3 }],
    look: { skin: '#8d5a3b', hair: '#1a1a1a', hat: 'cap', hatColor: '#2d7ff9', top: '#5b6470', vest, legs: '#24365a', shoes: '#2b2b2e', item: 'radio' },
  },
  {
    id: 'lee',
    name: 'Lee',
    title: 'Fleet Manager',
    rarity: 'rare',
    station: 'truck',
    boost: [
      { stat: 'truckSpeed', base: 12, perLevel: 3 },
      { stat: 'truckLoad', base: 10, perLevel: 3 },
    ],
    look: { skin: '#f0c7a0', hair: '#3a2a1a', hat: 'cap', hatColor: '#3fbf4a', top: '#ffffff', vest, legs: '#2d3e57', shoes: '#6b4423', item: 'clipboard' },
  },
  {
    id: 'maya',
    name: 'Maya',
    title: 'Logistics Boss',
    rarity: 'epic',
    station: 'truck',
    boost: [
      { stat: 'truckSpeed', base: 20, perLevel: 4 },
      { stat: 'truckLoad', base: 15, perLevel: 4 },
    ],
    ability: 'express',
    look: { skin: '#c98c64', hair: '#5a2a1a', hat: 'cap', hatColor: '#d64545', top: '#24365a', vest: '#f2c230', legs: '#2b2b2e', shoes: '#2b2b2e', item: 'radio' },
  },
  // Yards
  {
    id: 'ollie',
    name: 'Ollie',
    title: 'Yard Hand',
    rarity: 'common',
    station: 'yard',
    boost: [{ stat: 'unload', base: 15, perLevel: 4 }],
    look: { skin: '#e8b48f', hair: '#c9a24a', hat: 'hardhat', hatColor: '#3fbf4a', top: '#8a5a30', vest, legs: '#3a3a3e', shoes: '#3a2a1a', item: 'wrench' },
  },
  {
    id: 'nina',
    name: 'Nina',
    title: 'Yard Manager',
    rarity: 'rare',
    station: 'yard',
    boost: [
      { stat: 'unload', base: 15, perLevel: 4 },
      { stat: 'pay', base: 5, perLevel: 1.5 },
    ],
    look: { skin: '#8d5a3b', hair: '#1a1a1a', hat: 'hardhat', hatColor: '#2d7ff9', top: '#7a4f8f', vest, legs: '#24365a', shoes: '#2b2b2e', item: 'clipboard' },
  },
  {
    id: 'grace',
    name: 'Grace',
    title: 'Scrap Trader',
    rarity: 'epic',
    station: 'yard',
    boost: [{ stat: 'pay', base: 10, perLevel: 2 }],
    ability: 'market',
    look: { skin: '#f0c7a0', hair: '#8a3a1a', hat: 'none', hatColor: '#000000', top: '#3fa064', legs: '#2b2b2e', shoes: '#6b4423', item: 'clipboard' },
  },
  // Dumpsters
  {
    id: 'jo',
    name: 'Jo',
    title: 'Bin Boss',
    rarity: 'common',
    station: 'dumpster',
    boost: [{ stat: 'dumpster', base: 20, perLevel: 5 }],
    look: { skin: '#c98c64', hair: '#3a2a1a', hat: 'cap', hatColor: '#ff6b1a', top: '#3fa064', vest, legs: '#3a3a3e', shoes: '#2b2b2e', item: 'none' },
  },
  {
    id: 'ray',
    name: 'Ray',
    title: 'Waste Manager',
    rarity: 'rare',
    station: 'dumpster',
    boost: [{ stat: 'dumpster', base: 30, perLevel: 6 }],
    look: { skin: '#e8b48f', hair: '#9a9a9a', hat: 'hardhat', hatColor: '#f2c230', top: '#5b6470', vest, legs: '#2d3e57', shoes: '#2b2b2e', item: 'wrench' },
  },
  {
    id: 'kim',
    name: 'Kim',
    title: 'Haulage Pro',
    rarity: 'epic',
    station: 'dumpster',
    boost: [{ stat: 'dumpster', base: 40, perLevel: 8 }],
    ability: 'emptyAll',
    look: { skin: '#f0c7a0', hair: '#1a1a1a', hat: 'cap', hatColor: '#24365a', top: '#ff6b1a', legs: '#24365a', shoes: '#2b2b2e', item: 'radio' },
  },
  // Tools
  {
    id: 'bo',
    name: 'Bo',
    title: 'Tool Keeper',
    rarity: 'common',
    station: 'tools',
    boost: [{ stat: 'pick', base: 10, perLevel: 3 }],
    look: { skin: '#8d5a3b', hair: '#1a1a1a', hat: 'hardhat', hatColor: '#ff6b1a', top: '#d64545', vest, legs: '#3a3a3e', shoes: '#3a2a1a', item: 'wrench' },
  },
  {
    id: 'ivy',
    name: 'Ivy',
    title: 'Engineer',
    rarity: 'rare',
    station: 'tools',
    boost: [{ stat: 'pick', base: 12, perLevel: 3 }],
    automation: ['upgrade'],
    look: { skin: '#f0c7a0', hair: '#c9a24a', hat: 'hardhat', hatColor: '#ffffff', top: '#2d7ff9', vest, legs: '#2d3e57', shoes: '#2b2b2e', item: 'clipboard' },
  },
  {
    id: 'max',
    name: 'Max',
    title: 'Blaster',
    rarity: 'epic',
    station: 'tools',
    boost: [{ stat: 'pick', base: 20, perLevel: 4 }],
    automation: ['upgrade'],
    ability: 'charge',
    look: { skin: '#e8b48f', hair: '#5a2a1a', hat: 'hardhat', hatColor: '#d64545', top: '#2b2b2e', vest: '#f2c230', legs: '#2b2b2e', shoes: '#2b2b2e', item: 'radio' },
  },
  // Legendary: the player's own character.
  {
    id: 'boss',
    name: 'The Boss',
    title: 'Owner',
    rarity: 'legendary',
    station: 'any',
    boost: [], // +30% (+6%/level) to whatever station he runs — see bossBoost
    automation: ['claim', 'restart', 'upgrade'],
    ability: 'bossMode',
    look: OUTFIT_LOOK('suit'),
  },
]

// ── The Boss's outfits ─────────────────────────────────────────────────

export type OutfitId = 'suit' | 'fedora' | 'puffer' | 'shabbos' | 'wizard'

export const OUTFITS: { id: OutfitId; name: string; gems: number }[] = [
  { id: 'suit', name: 'Plaid suit', gems: 0 },
  { id: 'shabbos', name: 'Shabbos white', gems: 40 },
  { id: 'fedora', name: 'Fedora', gems: 60 },
  { id: 'puffer', name: 'Puffer jacket', gems: 80 },
  { id: 'wizard', name: 'Wizard robe', gems: 150 },
]

// Every outfit keeps the kippah (under the fedora) and the payos.
function OUTFIT_LOOK(o: OutfitId): Look {
  const base = { skin: '#f0cfae', hair: '#3b2a1e', payos: true, hatColor: '#1d2433', shoes: '#141414', item: 'none' as const }
  switch (o) {
    case 'suit':
      return { ...base, hat: 'kippah', hatColor: '#e9e4d6', top: '#1f2a4a', topPattern: 'plaid', under: '#ffffff', legs: '#1f2a4a' }
    case 'shabbos':
      return { ...base, hat: 'kippah', top: '#ffffff', under: '#ffffff', legs: '#1d2433' }
    case 'fedora':
      return { ...base, hat: 'fedora', hatColor: '#161616', top: '#ffffff', under: '#ffffff', legs: '#1f2a4a', topPattern: undefined }
    case 'puffer':
      return { ...base, hat: 'hood', hatColor: '#141414', top: '#141414', legs: '#2b2b2e' }
    case 'wizard':
      return { ...base, hat: 'kippah', top: '#9ec3e6', under: '#9ec3e6', legs: '#2b2b2e', glasses: true, tie: ['#8a1c2b', '#e3b33c'], robe: '#161616' }
  }
}
export const outfitLook = OUTFIT_LOOK

export function manager(id: string): ManagerDef | undefined {
  return MANAGERS.find((m) => m.id === id)
}

export const RARITY: Record<Rarity, { name: string; color: string; dark: string }> = {
  common: { name: 'Common', color: '#9aa5b1', dark: '#6f7b88' },
  rare: { name: 'Rare', color: '#2d7ff9', dark: '#1b5bbd' },
  epic: { name: 'Epic', color: '#9b59d0', dark: '#6c3a99' },
  legendary: { name: 'Legendary', color: '#f2b230', dark: '#c98a10' },
}

// ── Levels ─────────────────────────────────────────────────────────────

export const MAX_MANAGER_LEVEL = 10
// Cards needed to go from level n to n+1 (index n).
const CARDS = [0, 2, 4, 6, 10, 15, 25, 40, 60, 90]
const RARITY_MUL: Record<Rarity, number> = { common: 1, rare: 0.6, epic: 0.35, legendary: 0.2 }
export function cardsToLevel(m: ManagerDef, level: number): number {
  return Math.max(1, Math.round(CARDS[Math.min(level, CARDS.length - 1)] * RARITY_MUL[m.rarity]))
}
export function levelUpCost(m: ManagerDef, level: number): number {
  const base = { common: 200, rare: 800, epic: 3_000, legendary: 10_000 }[m.rarity]
  return Math.round(base * Math.pow(2.6, level - 1))
}

// A manager's boosts at a level, as multipliers (1.1 = +10%). The Boss
// boosts whatever his slot's station does.
export function boostsAt(m: ManagerDef, level: number, slot: Slot): Partial<Record<BoostStat, number>> {
  const out: Partial<Record<BoostStat, number>> = {}
  const list =
    m.id === 'boss'
      ? STATION_STATS[slotKind(slot)].map((stat) => ({ stat, base: 30, perLevel: 6 }))
      : m.boost
  for (const b of list) out[b.stat] = (out[b.stat] ?? 1) * (1 + (b.base + b.perLevel * (level - 1)) / 100)
  return out
}

export const STATION_STATS: Record<StationKind, BoostStat[]> = {
  crew: ['walk', 'pick'],
  truck: ['truckSpeed', 'truckLoad'],
  yard: ['unload', 'pay'],
  dumpster: ['dumpster'],
  tools: ['pick'],
}

export function fits(m: ManagerDef, slot: Slot) {
  return m.station === 'any' || m.station === slotKind(slot)
}

// ── Chests ─────────────────────────────────────────────────────────────

export type ChestType = 'wood' | 'iron' | 'gold'

export const CHESTS: Record<ChestType, { name: string; cards: number; odds: Record<Rarity, number>; gems: [number, number]; color: string; trim: string }> = {
  wood: { name: 'Wooden chest', cards: 2, odds: { common: 80, rare: 17.5, epic: 2.3, legendary: 0.2 }, gems: [1, 3], color: '#a0703f', trim: '#6b4423' },
  iron: { name: 'Iron chest', cards: 4, odds: { common: 62, rare: 30, epic: 7, legendary: 1 }, gems: [3, 8], color: '#8f9aa6', trim: '#5b6470' },
  gold: { name: 'Gold chest', cards: 8, odds: { common: 42, rare: 38, epic: 17, legendary: 3 }, gems: [10, 20], color: '#f2c230', trim: '#c98a10' },
}

// A free wooden chest comes this often.
export const FREE_CHEST_HOURS = 4

// Shop prices: iron for bricks (scaling with level), gold for gems.
export const chestBrickPrice = (level: number) => Math.round(400 * Math.pow(1.55, Math.max(0, level - 1)) / 100) * 100
export const GOLD_CHEST_GEMS = 120

export type Pull = { manager: string; rarity: Rarity }

// What a chest gives: cards (by rarity odds) and some gems.
export function rollChest(type: ChestType, rand: () => number = Math.random): { pulls: Pull[]; gems: number } {
  const c = CHESTS[type]
  const pulls: Pull[] = []
  for (let n = 0; n < c.cards; n++) {
    let roll = rand() * 100
    let rarity: Rarity = 'common'
    for (const r of ['legendary', 'epic', 'rare', 'common'] as Rarity[]) {
      roll -= c.odds[r]
      if (roll <= 0) {
        rarity = r
        break
      }
    }
    const pool = MANAGERS.filter((m) => m.rarity === rarity)
    const m = pool[Math.floor(rand() * pool.length)]
    pulls.push({ manager: m.id, rarity })
  }
  const gems = c.gems[0] + Math.floor(rand() * (c.gems[1] - c.gems[0] + 1))
  return { pulls, gems }
}
