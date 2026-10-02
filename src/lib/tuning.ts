// Game-wide balance sliders an admin can move without a code push (see
// /admin/tuning, migration 017). Each is a percentage of the built-in
// number: 100 = as designed, 80 = 20% less, 150 = 50% more.

export type TuneKey =
  | 'upgradePrices'
  | 'buildPrices'
  | 'walkSpeed'
  | 'pickupSpeed'
  | 'truckLoad'
  | 'truckSpeed'
  | 'brickValue'
  | 'xpRate'
  | 'unloadSpeed'
  | 'offlineTime'
  | 'bonusDrop'
  | 'boostPower'

export type Tuning = Record<TuneKey, number> // percent

export const TUNE_GROUPS: { title: string; items: { key: TuneKey; label: string; help: string; min: number; max: number }[] }[] = [
  {
    title: 'Prices',
    items: [
      { key: 'upgradePrices', label: 'Upgrade prices', help: 'Every upgrade, truck, dumpster and yard expansion', min: 25, max: 300 },
      { key: 'buildPrices', label: 'Building & plot prices', help: 'Starting a demolition and buying plots', min: 25, max: 300 },
    ],
  },
  {
    title: 'Crew & trucks',
    items: [
      { key: 'walkSpeed', label: 'Worker walking speed', help: 'How fast workers walk', min: 25, max: 300 },
      { key: 'pickupSpeed', label: 'Worker pickup speed', help: 'How fast workers work a brick loose', min: 25, max: 300 },
      { key: 'truckLoad', label: 'Truck load', help: 'Bricks each truck carries', min: 25, max: 300 },
      { key: 'truckSpeed', label: 'Truck speed', help: 'How fast trucks drive', min: 25, max: 300 },
    ],
  },
  {
    title: 'Earnings & XP',
    items: [
      { key: 'brickValue', label: 'Brick payouts', help: 'Bricks earned per brick hauled', min: 25, max: 300 },
      { key: 'xpRate', label: 'XP', help: 'How fast players level up', min: 25, max: 300 },
      { key: 'unloadSpeed', label: 'Unloading speed', help: 'How fast trucks unload at the Brick Yard', min: 25, max: 300 },
    ],
  },
  {
    title: 'Time away & bonuses',
    items: [
      { key: 'offlineTime', label: 'Max time away', help: 'How long the crew keeps working while the game is closed (100% = 12 hours)', min: 25, max: 200 },
      { key: 'bonusDrop', label: 'Dropped-load bonus', help: 'Bricks in the “truck dropped its load” bonus', min: 25, max: 300 },
      { key: 'boostPower', label: 'Tap boost strength', help: 'How much tapping the building speeds the crew up', min: 25, max: 300 },
    ],
  },
]

export const TUNE_KEYS: TuneKey[] = TUNE_GROUPS.flatMap((g) => g.items.map((i) => i.key))

export const DEFAULT_TUNING: Tuning = Object.fromEntries(TUNE_KEYS.map((k) => [k, 100])) as Tuning

// Any stored/sent value, cleaned up: unknown keys dropped, missing ones
// at 100, each clamped to its slider's range.
export function cleanTuning(raw: unknown): Tuning {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_TUNING }
  for (const g of TUNE_GROUPS)
    for (const i of g.items) {
      const v = Number(src[i.key])
      if (Number.isFinite(v)) out[i.key] = Math.max(i.min, Math.min(i.max, Math.round(v)))
    }
  return out
}
