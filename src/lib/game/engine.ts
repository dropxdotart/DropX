import { type Brick, type BrickColor } from './blueprints'
import { BUILDINGS, brickCount, bricksFor, getBuilding, legacyOf, levelForXp, registerCustomBuildings, sizeFor, xpForLevel, type BuildingDef } from './buildings'
import { PLOT_SLOTS } from './plots'
import {
  ABILITIES,
  FREE_CHEST_HOURS,
  GOLD_CHEST_GEMS,
  boostsAt,
  cardsToLevel,
  chestBrickPrice,
  fits,
  levelUpCost,
  manager,
  rollChest,
  type AbilityId,
  type ChestType,
  type OutfitId,
  type Pull,
  type Slot,
} from './managers'
import { OUTFITS } from './managers'
import { ZERO_COUNTERS, dailyGoals, dayKey, type Contract, type Counter, type Counters } from './goals'
import { ISLANDS, START_GROWN, islandAt, lastStage, setGrown, type Grown, type IslandId } from './islands'
import {
  dockPoint,
  MAX_DOCKS,
  kerbPath,
  kerbSpot,
  KERB_INSET,
  parkingSpot,
  parkPath,
  unparkPath,
  yardCapacity,
  YARD_MAX_SIZE,
  planRoute,
  plotStop,
  routeLength,
  yardGateIn,
  yardGateOut,
  yardEnterPath,
  yardExitPath,
  type Point,
  type RoadSpot,
} from './roads'

// The whole game simulation lives here, outside React: workers walking and
// carrying, rubble on the ground, the dumpsters and trucks, and the economy.
// Each plot you own is a Site with its own building, rubble, dumpster and
// truck run; the crew is one shared pool split across the plots. Positions
// inside a site are local to that plot's block (see plots.ts).
// The 3D scene advances it once per frame and draws whatever it says; the
// HUD subscribes to a throttled snapshot. Keeping it framework-free also
// means the same logic can be ported to the native app later.

import { BRICK, DUMPSTER, DUMPSTER_SLOTS, LOT_HALF, MAX_DUMPSTERS } from './layout'
import { eventDetail, eventInfo, eventTitle, type LiveEventKind } from '../liveEvents'
export { BRICK, DUMPSTER, DUMPSTER_SLOTS, LOT_HALF, MAX_DUMPSTERS, ROAD_Z, TRUCK_STOP } from './layout'

// v6: the island world (a fresh start, pre-launch).
const SAVE_KEY = 'rubble-save-v7' // v7: islands that grow in stages (fresh start)
const LEGACY_SAVE_KEY = 'rubble-save-v4'
// Set when an admin reset wipes the save, so the fresh game can say so;
// gifts sent after the reset wait here to be applied to the fresh game.
const RESET_NOTICE_KEY = 'rubble-reset-notice'
// Longest dumpster line; anyone else waits aside with their bricks.
const MAX_LINE = 6
const RESTORE_NOTICE_KEY = 'rubble-restore-notice'
const BAN_KEY = 'rubble-ban'
const SEEN_LIVE_KEY = 'rubble-seen-live' // events/messages already popped up
const DISMISSED_KEY = 'rubble-dismissed-banners'
export const PENDING_GRANTS_KEY = 'rubble-pending-grants'
export const CUSTOM_BUILDINGS_KEY = 'rubble-custom-buildings'
// Time away counts up to a full night.
const MAX_OFFLINE_SECONDS = 12 * 60 * 60
// Compute spent replaying time away before the rest is estimated from the
// pace measured during the replay.
const MAX_REPLAY_MS = 5000
const LOAD_SECONDS = 0.8
const BREAK_FALL_SECONDS = 0.7
// Tapping rubble gives the whole crew a short speed burst. No cooldown:
// every tap tops it back up to the full few seconds, so you can spam it.
export const BOOST_SECONDS = 3
// Rewarded-ad perks: 2× crew for this long, and how often the free upgrade
// and the instant dumpster empty can be watched for.
export const AD_BOOST_MINUTES = 5
// Tool animation timing (ms after use): when the ball hits, when it blows.
export const BALL_HITS_MS = [4500, 5700]
export const BALL_FX_MS = 9300
export const DYNAMITE_BOOM_MS = 5500
export const DYNAMITE_FX_MS = 9200
// The ad for extra hands: this many fast workers, for this long.
export const HELPERS = 4
export const HELPER_MINUTES = 3
export const FREE_UPGRADE_COOLDOWN_MINUTES = 30
export const DUMPSTER_AD_COOLDOWN_MINUTES = 10
const BOOST_FACTOR = 2

// Bonus drop: every few minutes a trailer passes on the front road and
// spills bricks on the sidewalk; watching an ad tips them straight into the
// dumpster (ignoring its limit), otherwise they're swept away.
export const BONUS_LIFETIME_SECONDS = 30
export const TRAILER_SECONDS = 7
export const TRAILER_FAR = 34
export const BONUS_SPOT = { x: 5.5, z: LOT_HALF + 0.7 }
const TRAILER_DROP_AT = (TRAILER_FAR - BONUS_SPOT.x) / (TRAILER_FAR * 2)
const nextBonusDelay = () => 180 + Math.random() * 120

// Site-wide upgrades. Each truck and each dumpster also has its own level.
export type Upgrades = {
  tools: number
  speed: number
  workers: number
  fleet: number
  yardSize: number // Brick Yard expansions (size = 1 + this)
  yardMax?: number // the size this yard can't grow past (set per yard)
  yardIndex?: number // which island's yard these are (set per yard)
  yardDocks: number // extra unloading docks (docks = 1 + this)
  yardSpeed: number
  yardBonus: number
  // Forklifts and shipping (per yard)
  forkSpeed: number
  forkPallet: number
  forkCount: number
  shipCap: number
  shipSpeed: number
}
export type UpgradeKey = Exclude<keyof Upgrades, 'yardMax' | 'yardIndex'>

export const UPGRADE_INFO: Record<UpgradeKey, { label: string; base: number; growth: number }> = {
  tools: { label: 'Better tools', base: 15, growth: 1.5 },
  speed: { label: 'Walking speed', base: 25, growth: 1.45 },
  workers: { label: 'Hire worker', base: 40, growth: 1.7 },
  fleet: { label: 'Buy a truck', base: 300, growth: 2.6 },
  yardSize: { label: 'Expand the yard', base: 1000, growth: 6.5 },
  yardDocks: { label: 'Add an unloading dock', base: 5000, growth: 10 },
  yardSpeed: { label: 'Faster unloading', base: 60, growth: 1.55 },
  yardBonus: { label: 'Better prices', base: 120, growth: 1.7 },
  forkSpeed: { label: 'Faster forklifts', base: 90, growth: 1.55 },
  forkPallet: { label: 'Bigger pallets', base: 130, growth: 1.6 },
  forkCount: { label: 'Buy a forklift', base: 600, growth: 3 },
  shipCap: { label: 'Bigger barge', base: 260, growth: 1.75 },
  shipSpeed: { label: 'Faster shipping', base: 200, growth: 1.65 },
}

// Each dumpster is bought per plot and sized up on its own.
export const DUMPSTER_UPGRADE = { label: 'Bigger dumpster', base: 30, growth: 1.5 }
// ── Pace ─────────────────────────────────────────────────────────────────
// The game's fixed pace, as factors on the built-in numbers. Not adjustable
// from admin — live events give temporary boosts on top. Crew and trucks at
// 0.8 and pay at 0.8 make progress about 1.5× slower than the raw numbers.
const PACE = { crew: 0.8, truck: 0.8, pay: 0.8 }
// Manager boosts (and abilities) in force right now, as multipliers — set
// by Engine.recalcManagers. Yard boosts are per yard.
const MGR = { walk: 1, pick: 1, truckSpeed: 1, truckLoad: 1, dumpster: 1, unload: [1, 1, 1], pay: [1, 1, 1], fork: [1, 1, 1] }

// What each brick / completion bonus is actually worth (for payout labels).
export const PAY_RATE = PACE.pay

// What a building contract / a plot costs right now.
export function buildPrice(cost: number) {
  return Math.round(cost)
}

// ── Live events (admin-scheduled, see liveEvents.ts) ────────────────────

export type LiveEvent = { id: string; kind: LiveEventKind; value: number; startsAt: string; endsAt: string }
export type Broadcast = { id: string; title: string; body: string | null; style: 'popup' | 'banner'; endsAt: string }

// The events currently known (from the last sync). Module-level so the
// price functions below can apply a sale.
let liveEvents: LiveEvent[] = []

// The real-world time the simulation is at: "now", or earlier while time
// away is being replayed (so an event only counts for when it was on).
let simClockOffsetMs = 0
const simNow = () => Date.now() - simClockOffsetMs

function eventsLive(kind: LiveEventKind, at = simNow()) {
  return liveEvents.filter((e) => e.kind === kind && new Date(e.startsAt).getTime() <= at && new Date(e.endsAt).getTime() > at)
}

// Multiplier from live events of a kind (1 when none).
export function eventMultiplier(kind: Exclude<LiveEventKind, 'upgrade_sale' | 'rain'>): number {
  return eventsLive(kind).reduce((m, e) => m * e.value, 1)
}

// Price factor from live sales (e.g. 0.75 for 25% off).
function saleFactor(): number {
  return Math.max(0.1, eventsLive('upgrade_sale', Date.now()).reduce((f, e) => f * (1 - e.value / 100), 1))
}

// Upgrade prices: the slider and any sale.
const priceFactor = () => saleFactor()

export function dumpsterUpgradeCost(level: number): number {
  return Math.round(DUMPSTER_UPGRADE.base * Math.pow(DUMPSTER_UPGRADE.growth, level) * priceFactor())
}
// Price of a plot's 2nd and 3rd dumpster.
const DUMPSTER_BUY_COSTS = [0, 400, 2500]
export function dumpsterBuyCost(owned: number): number | null {
  return owned < MAX_DUMPSTERS ? Math.round(DUMPSTER_BUY_COSTS[owned] * priceFactor()) : null
}

export type RewardKind = 'bricks' | 'set_bricks' | 'set_level' | 'boost' | 'upgrade' | 'reset' | 'restore' | 'rain'
export type Reward = { kind: RewardKind; amount: number; upgrade: string | null; data?: unknown }
// Set by an admin: the game shows a block screen (until = ISO end, null = permanent).
export type Ban = { until: string | null; reason: string }
export type ActivityEvent = { kind: 'building_started' | 'building_finished'; building: string; name: string; seconds?: number; at: number }

const ACTIVITY_KEY = 'rubble-activity'

function loadActivity(): ActivityEvent[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVITY_KEY)
    return raw ? (JSON.parse(raw) as ActivityEvent[]) : []
  } catch {
    return []
  }
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // storage unavailable — it may pop up again, that's all
  }
}

function storeActivity(events: ActivityEvent[]) {
  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(events))
  } catch {
    // storage unavailable — they still go up with this session's syncs
  }
}

export type Notice = { title: string; detail: string; message: string | null; emoji?: string; button?: string }

// Upgrades a code or gift can hand out for free, as players see them.
export const REWARD_UPGRADE_LABELS: Partial<Record<UpgradeKey, string>> = {
  workers: 'worker',
  fleet: 'truck',
  yardSize: 'yard expansion',
  yardDocks: 'unloading dock',
  tools: 'Better tools',
  speed: 'Walking speed',
  yardSpeed: 'Faster unloading',
  yardBonus: 'Better prices',
}

export type TruckUpgrade = 'load' | 'speed'
export const TRUCK_UPGRADE_INFO: Record<TruckUpgrade, { label: string; base: number; growth: number }> = {
  load: { label: 'Bigger truck', base: 35, growth: 1.5 },
  speed: { label: 'Faster truck', base: 40, growth: 1.5 },
}

export function truckUpgradeCost(key: TruckUpgrade, level: number): number {
  const info = TRUCK_UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level) * priceFactor())
}

export function upgradeCost(key: UpgradeKey, level: number): number {
  const info = UPGRADE_INFO[key]
  return Math.round(info.base * Math.pow(info.growth, level) * priceFactor())
}

// Level needed for the 2nd, 3rd and 4th unloading dock.
const DOCK_LEVELS = [5, 10, 15]

// Level needed for the yard's next size (from yardSize level n).
export function yardExpandLevel(n: number): number {
  return n < 4 ? [3, 6, 10, 15][n] : 15 + 5 * (n - 3)
}

// Why an upgrade can't be bought right now (besides the price), if so.
// `truckCapacity`: parking bays across all the player's yards (trucks need
// somewhere to park). For yard upgrades, `u` carries that yard's levels.
export function upgradeLock(key: UpgradeKey, u: Upgrades, level: number, truckCapacity?: number): string | null {
  if (key === 'fleet' && stats.truckCount(u) >= (truckCapacity ?? stats.yardCapacity(u))) return 'Yards full'
  if (key === 'yardDocks') {
    if (stats.docks(u) >= MAX_DOCKS) return 'Max docks'
    const need = DOCK_LEVELS[u.yardDocks]
    if (level < need) return `Lv ${need}`
  }
  if (key === 'yardSize') {
    if (stats.yardSize(u) >= (u.yardMax ?? YARD_MAX_SIZE)) return 'Max size'
    const need = yardExpandLevel(u.yardSize)
    if (level < need) return `Lv ${need}`
  }
  return null
}

// Station looks change at these levels (see stations.ts); the crew
// trailer's milestones also raise how many bricks a worker can carry.
export const MILESTONES = [5, 10, 25]
const milestonesReached = (level: number) => MILESTONES.filter((m) => level >= m).length

export const stats = {
  // BREAK is a fixed single brick per tap; tools make the workers faster.
  bricksPerTap: () => 1,
  // Bricks a worker carries per trip: +1 at each crew trailer milestone
  // (Tent 1 → Portacabin 2 → Site Office 3 → Site HQ 4).
  carry: (u: Upgrades) => 1 + milestonesReached(1 + u.workers + u.speed),
  // Pickup time: how long a worker spends working a brick loose (or
  // picking one up) before carrying it off. Starts slow; tools speed it up.
  pullSeconds: (u: Upgrades) => 3 / (1 + 0.15 * u.tools) / PACE.crew / MGR.pick,
  walkSpeed: (u: Upgrades) => 2 * (1 + 0.15 * u.speed) * PACE.crew * MGR.walk,
  workerCount: (u: Upgrades) => 3 + u.workers, // a crew of three to start
  dumpsterCapacity: (level: number) => Math.round((20 + 10 * level) * MGR.dumpster),
  truckCount: (u: Upgrades) => 1 + u.fleet,
  // The Brick Yard's size sets how many trucks you can buy (2 bays a size).
  yardSize: (u: Upgrades) => Math.min(u.yardMax ?? YARD_MAX_SIZE, 1 + u.yardSize),
  yardCapacity: (u: Upgrades) => yardCapacity(Math.min(u.yardMax ?? YARD_MAX_SIZE, 1 + u.yardSize)),
  docks: (u: Upgrades) => Math.min(MAX_DOCKS, 1 + u.yardDocks),
  // Per truck, from that truck's own levels.
  truckCargo: (loadLevel: number) => Math.max(1, Math.round((20 + 10 * loadLevel) * MGR.truckLoad)),
  truckSpeed: (speedLevel: number) => 6 * (1 + 0.12 * speedLevel) * PACE.truck * MGR.truckSpeed,
  unloadSeconds: (u: Upgrades) => Math.max(0.2, (2 * Math.pow(0.88, u.yardSpeed)) / (MGR.unload[u.yardIndex ?? 0] ?? 1)),
  priceBonus: (u: Upgrades) => 0.05 * u.yardBonus,
  // Forklifts carry pallets from the pile to the shipping dock; the barge
  // (or freight trailer) leaves when full and the load is paid for then.
  forklifts: (u: Upgrades) => 1 + u.forkCount,
  forkSpeed: (u: Upgrades) => 2.2 * (1 + 0.12 * u.forkSpeed) * (MGR.fork[u.yardIndex ?? 0] ?? 1),
  palletBricks: (u: Upgrades) => 12 + 6 * u.forkPallet,
  // Pallets per trip: a bigger forklift at the station's milestones.
  palletsPerTrip: (u: Upgrades) => 1 + MILESTONES.filter((m) => 1 + u.forkSpeed + u.forkPallet >= m).length,
  shipCapacity: (u: Upgrades) => 100 + 50 * u.shipCap,
  shipAwaySeconds: (u: Upgrades) => Math.max(8, 45 * Math.pow(0.88, u.shipSpeed)) / Math.sqrt(MGR.fork[u.yardIndex ?? 0] ?? 1),
}

export type WorkerState = 'idle' | 'toPick' | 'picking' | 'toDumpster' | 'waiting' | 'holding'

export type Worker = {
  id: number
  plot: number
  x: number
  z: number
  heading: number
  state: WorkerState
  tx: number
  tz: number
  target: { kind: 'brick'; index: number } | { kind: 'rubble'; id: number } | null
  timer: number
  // Colour of the top brick in their arms (null = empty-handed) and how
  // many they're holding.
  carrying: BrickColor | null
  held: number
  dumpster: number // which of the plot's dumpsters they're heading to / lined up at
  onBreak?: number // seconds sat down on a break (needs you, or a crew manager)
  fast?: boolean // a temporary helper from an ad: twice the speed
  via: { x: number; z: number }[] // corners to walk past first (around the building)
}

export type Rubble = { id: number; x: number; z: number; color: BrickColor; claimed: boolean; readyAt: number }

// 'away' is kept for the plot snapshot: no truck at that plot right now.
export type TruckState = 'away' | 'driving' | 'loading' | 'unloading' | 'parked'

// The fleet drives the real roads in laps: each owned plot in order
// (skipping empty dumpsters), loading what's there; if it fills up mid-lap
// it unloads at the Brick Yard and carries on, and it always unloads at the
// end of a lap. Bricks are paid for when they're unloaded.
export type Truck = {
  id: number
  load: number // upgrade levels, per truck
  speed: number
  state: TruckState
  x: number
  z: number
  heading: number
  path: Point[]
  dest: { kind: 'plot'; plot: number } | { kind: 'yard' } | { kind: 'park' }
  at: RoadSpot // the plot stop it's at, when out on the road
  home: number // the island whose yard it parks at
  yard: number // the island whose yard it's in / heading to
  inYard: 'bay' | 'parked' | null // inside that yard's fence
  dock: number // the unloading dock it's heading to / using
  stuck: number // seconds spent waiting behind another truck
  squeeze: number // seconds left of squeezing past (after waiting too long)
  lap: number // next plot index to visit this lap
  timer: number
  cargo: number
  cargoValue: number
  broken: number // seconds broken down at the roadside (0 = running)
}

export type EngineEvent =
  | { type: 'siteStarted' }
  | { type: 'resync' }
  | { type: 'brickBroken'; index: number; toX: number; toZ: number }
  | { type: 'brickPulled'; index: number; workerId: number }
  | { type: 'rubbleSpawned'; id: number }
  | { type: 'rubblePicked'; id: number }

// empty: owned, waiting for you to pick a building. cleared: building's
// gone, waiting for you to tap and claim the completion bonus.
export type PlotPhase = 'empty' | 'demolishing' | 'cleared'

export type PlotSnap = {
  id: number
  phase: PlotPhase
  buildingId: string
  bricksTotal: number
  bricksLeft: number
  rubbleLeft: number
  dumpsterLoad: number // all of the plot's dumpsters together
  dumpsters: { level: number; load: number; capacity: number }[]
  truckState: TruckState
  crew: number
  crewTarget: number // where the crew split is heading (workers walk over)
}

export type TruckSnap = { id: number; load: number; speed: number; cargo: number; state: TruckState }

export type Snapshot = {
  scrap: number
  xp: number
  level: number
  upgrades: Upgrades
  plots: PlotSnap[]
  trucks: TruckSnap[]
  crewAuto: boolean
  crewMode: 'work' | 'even' | 'custom'
  incomePerMinute: number
  offlineEarnings: number
  sitesCleared: number
  bonusDrop: { amount: number; secondsLeft: number; chest: ChestType | null } | null
  // Seconds of crew boost left (0 = off).
  boostLeft: number
  notice: Notice | null
  // Replaying time away: progress 0–1, or null when not catching up.
  catchUp: number | null
  shortId: string | null
  username: string | null
  ban: Ban | null
  raining: boolean
  yardBuild: { yard: number; toSize: number; secondsLeft: number; totalSeconds: number } | null
  islands: { id: IslandId; open: boolean; stage: number; yard: YardLevels }[]
  // Each yard's pile and barge.
  yardOps: { pile: number; shipLoad: number; shipCap: number; shipAway: number; forklifts: number }[]
  truckCapacity: number
  // You on site: tools, things needing you, goals.
  tools: { ballIn: number; dynamiteIn: number; ballCharges: number; dynamiteCharges: number; ballPack: { gems: number; bricks: number }; dynamitePack: { gems: number; bricks: number } }
  toolFx: { plot: number; kind: 'ball' | 'dynamite'; at: number } | null
  needs: { brokenTruck: number | null; restingWorker: number | null; jam: boolean }
  catchOffer: number // seconds left on a "bricks are falling" offer (0 = none)
  helpersLeft: number // seconds left of the ad's extra fast workers
  goals: { text: string; progress: number; target: number; gems: number; claimed: boolean }[]
  goalsBonusReady: boolean
  goalsBonusClaimed: boolean
  contract: { name: string; progress: number; target: number; chest: 'iron' | 'gold'; gems: number } | null
  // Managers, chests and gems.
  gems: number
  chests: Record<ChestType, number>
  freeChestIn: number // seconds until the free chest (0 = ready)
  adChestIn: number
  ironChestPrice: number
  managers: Record<string, { level: number; cards: number }>
  assigned: Partial<Record<Slot, string>>
  abilities: Partial<Record<Slot, { readyIn: number; activeLeft: number }>>
  outfit: OutfitId
  outfits: OutfitId[]
  // Land being raised: an island's next stage (stage 0 = the bridge to it).
  landBuild: { island: IslandId; stage: number; secondsLeft: number; totalSeconds: number } | null
  // Seconds until each once-in-a-while ad reward is offered again (0 = ready).
  freeUpgradeIn: number
  dumpsterAdIn: number
  // What emptying every dumpster right now would pay.
  dumpsterValue: number
  events: LiveEvent[]
  banners: Broadcast[]
  synced: boolean
}

type PlotSave = {
  phase: PlotPhase
  buildingId: string
  removed: string
  rubble: number
  // An admin-made building in progress keeps its own copy, so later edits
  // to (or deleting) the building never break the demolition.
  custom?: BuildingDef
  dumpsterLoad?: number // before each plot could have several dumpsters
  dumpsters?: { level: number; load: number }[]
  worked?: number // seconds spent demolishing this building so far
}

export type SaveData = {
  scrap: number
  xp: number
  upgrades: Upgrades
  plots: PlotSave[]
  trucks?: { load: number; speed: number; home?: number }[]
  crewPlan: number[] | null
  sitesCleared: number
  lastSeen: number
  yardBuild?: YardBuild | null
  yards?: YardLevels[]
  yardOps?: { pile: number; pileValue: number; ship: { away: number; load: number; value: number; idle: number } }[]
  grown?: Grown
  landBuild?: LandBuild | null
  you?: {
    toolReady: { ball: number; dynamite: number }
    toolCharges?: { ball: number; dynamite: number }
    counters: Counters
    goalDay: { day: string; base: Counters; claimed: boolean[]; bonus: boolean }
    contract: Contract | null
    clearedById: Record<string, number>
    helpersUntil?: number
  }
  mgr?: {
    managers: Record<string, { level: number; cards: number }>
    assigned: Partial<Record<Slot, string>>
    abilityReady: Partial<Record<Slot, number>>
    chests: Record<ChestType, number>
    freeChestAt: number
    gems: number
    outfit: OutfitId
    outfits: OutfitId[]
    rewardedLevel: number
  }
  adCooldowns?: { freeUpgrade: number; dumpsters: number; chest?: number }
}

// A yard expansion under construction: real-world times (ms), so it keeps
// building while the game is closed. `level` is the yardSize it finishes at.
export type YardBuild = { yard: number; level: number; startedAt: number; endsAt: number }

// Each island's yard has its own upgrade levels.
export type YardLevels = { size: number; docks: number; speed: number; bonus: number; forkSpeed: number; forkPallet: number; forkCount: number; shipCap: number; shipSpeed: number }
export const YARD_KEYS = ['yardSize', 'yardDocks', 'yardSpeed', 'yardBonus', 'forkSpeed', 'forkPallet', 'forkCount', 'shipCap', 'shipSpeed'] as const
const YARD_FIELD: Record<(typeof YARD_KEYS)[number], keyof YardLevels> = {
  yardSize: 'size',
  yardDocks: 'docks',
  yardSpeed: 'speed',
  yardBonus: 'bonus',
  forkSpeed: 'forkSpeed',
  forkPallet: 'forkPallet',
  forkCount: 'forkCount',
  shipCap: 'shipCap',
  shipSpeed: 'shipSpeed',
}
// ── Yard operations: the pile, forklifts and shipping ──────────────────

export type Fork = { state: 'toPile' | 'loading' | 'toDock' | 'unloading'; t: number; carry: number; value: number }
export type YardOps = { pile: number; pileValue: number; forks: Fork[]; ship: { away: number; load: number; value: number; idle: number }; shipped: number }
// A forklift's run from the pile to the dock (world units), how long a
// pick-up or drop-off takes, and how long a part-loaded barge waits.
export const FORK_RUN = 12
const FORK_HANDLE = 1.2
const SHIP_WAIT = 40
const newOps = (): YardOps => ({ pile: 0, pileValue: 0, forks: [], ship: { away: 0, load: 0, value: 0, idle: 0 }, shipped: 0 })

export const NEW_YARD: YardLevels = { size: 0, docks: 0, speed: 0, bonus: 0, forkSpeed: 0, forkPallet: 0, forkCount: 0, shipCap: 0, shipSpeed: 0 }
export const isYardKey = (k: UpgradeKey): k is (typeof YARD_KEYS)[number] => (YARD_KEYS as readonly string[]).includes(k)

// Land being raised on an island (real-world times, ms).
export type LandBuild = { island: IslandId; stage: number; startedAt: number; endsAt: number }
export const LAND_AD_SHARE = 0.25

// How long building the yard up to each size takes (sizes 2–10).
const YARD_BUILD_MINUTES = [5, 15, 30, 60, 120, 180, 240, 300, 360]
export function yardBuildSeconds(toSize: number): number {
  return YARD_BUILD_MINUTES[Math.max(0, Math.min(YARD_BUILD_MINUTES.length - 1, toSize - 2))] * 60
}
// Each ad takes this share of the full build time off.
export const YARD_AD_SHARE = 0.25

type LegacySave = {
  scrap: number
  xp: number
  upgrades: Partial<Upgrades> & { hammer?: number; truck?: number; dumpster?: number }
  buildingId: string
  phase: 'demolishing' | 'picking'
  removed: string
  rubble: number
  dumpsterLoad: number
  sitesCleared?: number
  lastSeen: number
}

function encodeBits(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((b, i) => {
    if (b) bytes[i >> 3] |= 1 << (i & 7)
  })
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s)
}

function savedBrickBytes(encoded: string): number {
  try {
    return atob(encoded).length
  } catch {
    return -1
  }
}

function decodeBits(encoded: string, length: number): Uint8Array {
  const bits = new Uint8Array(length)
  try {
    const s = atob(encoded)
    // Saved for a different number of bricks (the building was redesigned):
    // start it fresh rather than knock random holes in the new one.
    if (s.length !== Math.ceil(length / 8)) return bits
    for (let i = 0; i < length; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1
  } catch {
    // corrupt save — start the site fresh
  }
  return bits
}

// One plot's demolition site: the building's bricks, rubble on the ground,
// the dumpster and this plot's truck run.
export class Site {
  phase: PlotPhase = 'empty'
  worked = 0 // seconds of demolishing (online + away) on this building
  building: BuildingDef = BUILDINGS[0]
  bricks: Brick[] = []
  removed: Uint8Array = new Uint8Array(0)
  claimed: Uint8Array = new Uint8Array(0)
  bricksLeft = 0
  // Each column (unique x,z) lists its brick indices bottom→top; bricks only
  // ever leave from the top, so a pointer per column tracks the current top.
  columns: number[][] = []
  columnTop = new Int32Array(0)
  columnAt = new Map<string, number>() // "x,z" (brick units) → column
  brickColumn = new Int32Array(0)
  halfX = 0
  halfZ = 0

  rubble: Rubble[] = []
  // Each dumpster's size level, how full it is, and the worker ids lined
  // up at it (front first; only the front one tips their bricks in).
  dumpsters: { level: number; load: number; queue: number[] }[] = [{ level: 0, load: 0, queue: [] }]
  private nextRubbleId = 1

  get dumpsterLoad() {
    return this.dumpsters.reduce((n, d) => n + d.load, 0)
  }
  // Drained by this plot's Building renderer.
  events: EngineEvent[] = []

  constructor(readonly id: number) {}

  loadBuilding(def: BuildingDef, removed?: Uint8Array) {
    this.building = def
    this.bricks = bricksFor(def)
    this.removed = removed ?? new Uint8Array(this.bricks.length)
    this.claimed = new Uint8Array(this.bricks.length)
    const [w, , d] = sizeFor(def)
    this.halfX = (w * BRICK) / 2
    this.halfZ = (d * BRICK) / 2

    const byKey = new Map<string, number[]>()
    this.bricks.forEach((b, i) => {
      const key = `${b.x},${b.z}`
      const list = byKey.get(key)
      if (list) list.push(i)
      else byKey.set(key, [i])
    })
    this.columns = [...byKey.values()].map((list) => list.sort((a, b) => this.bricks[a].y - this.bricks[b].y))
    this.columnAt = new Map([...byKey.keys()].map((k, c) => [k, c]))
    this.columnTop = new Int32Array(this.columns.length)
    this.brickColumn = new Int32Array(this.bricks.length)
    this.columns.forEach((list, c) => {
      for (const i of list) this.brickColumn[i] = c
      let top = list.length - 1
      while (top >= 0 && this.removed[list[top]]) top--
      this.columnTop[c] = top
    })
    this.bricksLeft = this.bricks.length - this.removed.reduce((n, r) => n + r, 0)
    this.events.push({ type: 'siteStarted' })
  }

  // Empty plots draw nothing; keep the last building's data but no bricks.
  clearBricks() {
    this.bricks = []
    this.removed = new Uint8Array(0)
    this.claimed = new Uint8Array(0)
    this.columns = []
    this.columnTop = new Int32Array(0)
    this.columnAt = new Map()
    this.brickColumn = new Int32Array(0)
    this.bricksLeft = 0
    this.events.push({ type: 'siteStarted' })
  }

  brickWorld(i: number) {
    const b = this.bricks[i]
    return { x: b.x * BRICK, y: b.y * BRICK + BRICK / 2, z: b.z * BRICK }
  }

  removeBrick(i: number) {
    this.removed[i] = 1
    this.claimed[i] = 0
    this.bricksLeft--
    const c = this.brickColumn[i]
    let t = this.columnTop[c]
    while (t >= 0 && this.removed[this.columns[c][t]]) t--
    this.columnTop[c] = t
  }

  // The best unclaimed top-of-column brick: nearest to `near` (a worker's
  // preferred spot) if given, otherwise the highest one (taps take the roof
  // off first, which reads as demolition rather than random damage).
  pickTopBrick(near: { x: number; z: number } | null): number {
    let best = -1
    let bestScore = Infinity
    for (let c = 0; c < this.columns.length; c++) {
      const top = this.columnTop[c]
      if (top < 0) continue
      const i = this.columns[c][top]
      if (this.claimed[i]) continue
      const b = this.bricks[i]
      // Workers peel the building from the outside in (close to where
      // they stand), starting near their own side of it.
      const depth = Math.min(this.halfX - Math.abs(b.x * BRICK), this.halfZ - Math.abs(b.z * BRICK))
      const score = near
        ? (b.x * BRICK - near.x) ** 2 + (b.z * BRICK - near.z) ** 2 + depth * 8 - b.y * BRICK * 0.15
        : -b.y + Math.random() * 0.9
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    return best
  }

  spawnRubble(color: BrickColor, readyAt: number, from?: { x: number; z: number }) {
    const angle = from ? Math.atan2(from.z, from.x) + (Math.random() - 0.5) * 0.8 : Math.random() * Math.PI * 2
    const reach = Math.max(this.halfX, this.halfZ) + 0.4 + Math.random() * 1.6
    const limit = LOT_HALF - 0.6
    const x = Math.max(-limit, Math.min(limit, Math.cos(angle) * reach))
    const z = Math.max(-limit, Math.min(DUMPSTER.z - 1.2, Math.sin(angle) * reach))
    const r: Rubble = { id: this.nextRubbleId++, x, z, color, claimed: false, readyAt }
    this.rubble.push(r)
    return r
  }

  // A spot in a dumpster's line: front first, along the slot's direction,
  // wrapping into a second row (see DUMPSTER_SLOTS).
  queueSpot(dumpster: number, i: number) {
    // One tidy straight line (at most MAX_LINE long; the rest wait aside).
    const slot = DUMPSTER_SLOTS[dumpster]
    const k = Math.min(i, MAX_LINE - 1)
    return { x: slot.line.x + slot.dir.x * k, z: slot.line.z + slot.dir.z * k }
  }

  // Where workers wait with their bricks while a dumpster is full or its
  // line is long: a loose group on the far side of the dumpster.
  holdSpot(dumpster: number, i: number) {
    const slot = DUMPSTER_SLOTS[dumpster]
    const len = Math.hypot(slot.dir.x, slot.dir.z) || 1
    const ux = slot.dir.x / len
    const uz = slot.dir.z / len
    // A 5×4 group; any more stand a little off-grid so they don't stack.
    const k = i % 20
    const col = k % 5
    const row = Math.floor(k / 5)
    const jitter = i >= 20 ? 0.25 * (1 + Math.floor(i / 20)) : 0
    const x = slot.x - ux * (1.9 + col * 0.5 + jitter) + slot.wrap.x * (row * 0.6 + jitter)
    const z = slot.z - uz * (1.9 + col * 0.5 + jitter) + slot.wrap.z * (row * 0.6 + jitter)
    const lim = LOT_HALF - 0.4
    return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) }
  }

  // Corners to walk past so a straight line between two spots doesn't cut
  // through the building's footprint.
  detour(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
    if (!this.bricksLeft) return []
    const hx = this.halfX + 0.25
    const hz = this.halfZ + 0.25
    const crosses = (ax: number, az: number, bx: number, bz: number) => {
      // Segment vs. rectangle (slab test).
      let t0 = 0
      let t1 = 1
      const dx = bx - ax
      const dz = bz - az
      for (const [p, d, lo, hi] of [[ax, dx, -hx, hx], [az, dz, -hz, hz]]) {
        if (Math.abs(d) < 1e-9) {
          if (p <= lo || p >= hi) return false
        } else {
          let a = (lo - p) / d
          let b = (hi - p) / d
          if (a > b) [a, b] = [b, a]
          t0 = Math.max(t0, a)
          t1 = Math.min(t1, b)
          if (t0 >= t1) return false
        }
      }
      return t1 - t0 > 0.02
    }
    if (!crosses(fx, fz, tx, tz)) return []
    const cx = this.halfX + 0.55
    const cz = this.halfZ + 0.55
    const corners = [
      { x: cx, z: cz },
      { x: -cx, z: cz },
      { x: -cx, z: -cz },
      { x: cx, z: -cz },
    ]
    const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
    const from = { x: fx, z: fz }
    const to = { x: tx, z: tz }
    let best: { x: number; z: number }[] = []
    let bestLen = Infinity
    for (let i = 0; i < 4; i++) {
      const c = corners[i]
      if (!crosses(fx, fz, c.x, c.z) && !crosses(c.x, c.z, tx, tz)) {
        const len = d(from, c) + d(c, to)
        if (len < bestLen) {
          bestLen = len
          best = [c]
        }
      }
      for (const j of [(i + 1) % 4, (i + 3) % 4]) {
        const c2 = corners[j]
        if (!crosses(fx, fz, c.x, c.z) && !crosses(c2.x, c2.z, tx, tz)) {
          const len = d(from, c) + d(c, c2) + d(c2, to)
          if (len < bestLen) {
            bestLen = len
            best = [c, c2]
          }
        }
      }
    }
    return best
  }

  // Shortest line wins; ties go to the dumpster with the most room.
  pickDumpster(capacityOf: (level: number) => number, walkingTo: number[]): number {
    let best = 0
    let bestScore = Infinity
    this.dumpsters.forEach((d, i) => {
      const score = (d.queue.length + walkingTo[i]) * 1000 - (capacityOf(d.level) - d.load)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  // A preferred spot around the building for each worker (golden-angle
  // spread) so the crew fans out instead of all queueing at one wall.
  homeSpot(slot: number, crew: number) {
    // Evenly round the building by the worker's place in this plot's crew.
    const a = (slot / Math.max(1, crew)) * Math.PI * 2 + this.id * 0.7
    return { x: Math.cos(a) * (this.halfX + 2), z: Math.sin(a) * (this.halfZ + 2) }
  }

  // Where a worker stands to pull a given brick: just outside the footprint
  // on the side nearest that brick.
  // Steps out from the brick (in brick units) toward the nearest outside
  // edge until reaching ground that's already cleared or outside the
  // footprint — so they stand right next to what they're pulling, never
  // inside the walls.
  standSpot(i: number) {
    const b = this.bricks[i]
    const nx = (b.x * BRICK) / Math.max(this.halfX, 0.01)
    const nz = (b.z * BRICK) / Math.max(this.halfZ, 0.01)
    const alongX = Math.abs(nx) > Math.abs(nz)
    const dir = Math.sign(alongX ? b.x : b.z) || 1
    for (let s = 1; s < 80; s++) {
      const px = alongX ? b.x + dir * s : b.x
      const pz = alongX ? b.z : b.z + dir * s
      const c = this.columnAt.get(`${px},${pz}`)
      if (c === undefined || this.columnTop[c] < 0) {
        // Half a brick short of the empty cell's centre: close, not inside.
        const back = s === 1 ? 0.1 : 0.35
        return { x: (alongX ? px - dir * back : px) * BRICK, z: (alongX ? pz : pz - dir * back) * BRICK }
      }
    }
    return { x: alongX ? dir * (this.halfX + 0.45) : b.x * BRICK, z: alongX ? b.z * BRICK : dir * (this.halfZ + 0.45) }
  }
}

export class Engine {
  time = 0
  scrap = 0
  xp = 0
  upgrades: Upgrades = { tools: 0, speed: 0, workers: 0, fleet: 0, yardSize: 0, yardDocks: 0, yardSpeed: 0, yardBonus: 0, forkSpeed: 0, forkPallet: 0, forkCount: 0, shipCap: 0, shipSpeed: 0 }
  sitesCleared = 0
  offlineEarnings = 0

  // Owned plots, in unlock order (plots[i] sits on PLOT_SLOTS[i]).
  plots: Site[] = []
  workers: Worker[] = []
  trucks: Truck[] = []
  // Manual crew split per plot, or null to split evenly (see desiredCrew).
  crewPlan: number[] | null = null
  private recentHauls: { t: number; value: number }[] = []

  private listeners = new Set<() => void>()
  private dirty = true
  private lastFlush = 0
  private snapshot: Snapshot | null = null

  get home(): Site {
    return this.plots[0]
  }

  // ── Setup ─────────────────────────────────────────────────────────────

  // The truck loading at (or heading for) a plot, if any.
  truckAt(site: Site): Truck | null {
    return this.trucks.find((t) => t.dest.kind === 'plot' && t.dest.plot === site.id && t.state !== 'parked') ?? null
  }

  private loadingAt(site: Site) {
    return this.trucks.some((t) => t.state === 'loading' && t.dest.kind === 'plot' && t.dest.plot === site.id)
  }

  // ── Islands and yards ─────────────────────────────────────────────────

  yardLevels: YardLevels[] = ISLANDS.map(() => ({ ...NEW_YARD }))
  yardOps: YardOps[] = ISLANDS.map(newOps)

  // Forklifts shuttle pallets from the pile to the dock; the barge leaves
  // when full (or after waiting a while part-loaded) and is paid for then.
  private tickYards(dt: number) {
    for (const y of this.openYards()) {
      const ops = this.yardOps[y]
      const u = this.yardU(y)
      while (ops.forks.length < stats.forklifts(u)) ops.forks.push({ state: 'toPile', t: ops.forks.length * 0.35, carry: 0, value: 0 })
      const ship = ops.ship
      const cap = stats.shipCapacity(u)
      if (ship.away > 0) {
        ship.away -= dt
        if (ship.away <= 0) ops.ship = { away: 0, load: 0, value: 0, idle: 0 }
      } else if (ship.load > 0) {
        ship.idle += dt
        if (ship.load >= cap || ship.idle > SHIP_WAIT) this.shipOut(y)
      }
      const leg = FORK_RUN / stats.forkSpeed(u)
      const lift = stats.palletBricks(u) * stats.palletsPerTrip(u)
      for (const f of ops.forks) {
        switch (f.state) {
          case 'toPile':
            f.t += dt / leg
            if (f.t >= 1) {
              f.t = 0
              f.state = 'loading'
            }
            break
          case 'loading': {
            if (ops.pile <= 0) break // waiting for bricks
            f.t += dt / FORK_HANDLE
            if (f.t < 1) break
            const take = Math.min(lift, ops.pile)
            const value = (ops.pileValue * take) / ops.pile
            ops.pile -= take
            ops.pileValue -= value
            f.carry = take
            f.value = value
            f.t = 0
            f.state = 'toDock'
            break
          }
          case 'toDock':
            f.t += dt / leg
            if (f.t >= 1) {
              f.t = 0
              f.state = 'unloading'
            }
            break
          case 'unloading':
            if (ops.ship.away > 0) break // waiting for the barge to come back
            f.t += dt / FORK_HANDLE
            if (f.t < 1) break
            ops.ship.load += f.carry
            ops.ship.value += f.value
            ops.ship.idle = 0
            f.carry = 0
            f.value = 0
            f.t = 0
            f.state = 'toPile'
            if (ops.ship.load >= cap) this.shipOut(y)
            break
        }
      }
    }
  }

  private shipOut(y: number) {
    const ops = this.yardOps[y]
    if (ops.ship.load <= 0) return
    this.pay(ops.ship.load, ops.ship.value)
    ops.shipped++
    ops.ship.away = stats.shipAwaySeconds(this.yardU(y))
    ops.ship.idle = 0
    this.markDirty()
  }
  // How far each island has grown (−1 = not reached) and what's being raised.
  grown: Grown = { ...START_GROWN }
  landBuild: LandBuild | null = null
  // When each ad reward can be watched again (ms timestamps).
  adCooldowns = { freeUpgrade: 0, dumpsters: 0, chest: 0 }

  // ── You on site: tools, hiccups, goals ───────────────────────────────

  toolReady = { ball: 0, dynamite: 0 } // ms
  // Bought uses: spent instead of waiting out the cooldown.
  toolCharges = { ball: 0, dynamite: 0 }

  // A pack of 3 uses, for gems or bricks (bricks scale with level).
  toolPackPrice(kind: 'ball' | 'dynamite') {
    const gems = kind === 'ball' ? 10 : 15
    const bricks = Math.round((chestBrickPrice(levelForXp(this.xp)) * (kind === 'ball' ? 0.6 : 0.9)) / 100) * 100
    return { gems, bricks }
  }
  buyToolPack(kind: 'ball' | 'dynamite', pay: 'gems' | 'bricks'): string | null {
    const p = this.toolPackPrice(kind)
    if (pay === 'gems') {
      if (this.gems < p.gems) return 'Not enough gems'
      this.gems -= p.gems
    } else {
      if (this.scrap < p.bricks) return 'Not enough bricks'
      this.scrap -= p.bricks
    }
    this.toolCharges[kind] += 3
    this.save()
    this.markDirty()
    return null
  }
  // Ready now, or a bought use to spend? (Spends it.)
  private useToolTurn(kind: 'ball' | 'dynamite', cooldownMs: number) {
    if (Date.now() >= this.toolReady[kind]) {
      this.toolReady[kind] = Date.now() + cooldownMs
      return true
    }
    if (this.toolCharges[kind] > 0) {
      this.toolCharges[kind]--
      return true
    }
    return false
  }
  toolFx: { plot: number; kind: 'ball' | 'dynamite'; at: number } | null = null
  // Tool hits waiting for their moment in the animation (real-world ms).
  private pendingKnocks: { plot: number; at: number; share: number; min: number; near: { x: number; z: number } | null }[] = []
  private runPendingKnocks() {
    if (!this.pendingKnocks.length) return
    const now = Date.now()
    const due = this.pendingKnocks.filter((k) => k.at <= now)
    if (!due.length) return
    this.pendingKnocks = this.pendingKnocks.filter((k) => k.at > now)
    for (const k of due) {
      const site = this.plots[k.plot]
      if (site && site.phase === 'demolishing') this.knock(site, k.share, k.min, k.near)
    }
    this.markDirty()
  }
  counters: Counters = { ...ZERO_COUNTERS }
  goalDay = { day: '', base: { ...ZERO_COUNTERS }, claimed: [false, false, false], bonus: false }
  contract: Contract | null = null
  clearedById: Record<string, number> = {}
  jamSince = -1 // sim seconds; -1 = no jam
  private nextHiccupAt = 240
  catchOfferUntil = 0 // ms
  private nextCatchAt = Date.now() + 6 * 60_000

  count(kind: Counter, n = 1) {
    this.counters[kind] += n
  }

  // Watched an ad: four fast extra workers join for a few minutes.
  helpersUntil = 0 // ms
  adHelpers() {
    this.helpersUntil = Math.max(Date.now(), this.helpersUntil) + HELPER_MINUTES * 60_000
    this.syncHelpers()
    this.markDirty()
  }

  // Adds the helpers while they're hired, lets them go when time's up
  // (anything they were carrying is left on the ground).
  private syncHelpers() {
    const active = Date.now() < this.helpersUntil
    if (active && this.workers.filter((w) => w.fast).length < HELPERS) {
      const start = this.plots.find((p) => p.phase === 'demolishing') ?? this.home
      for (let k = this.workers.filter((w) => w.fast).length; k < HELPERS; k++) {
        const w = this.newWorker(1000 + k, start.id)
        w.fast = true
        this.workers.push(w)
      }
    }
    if (!active && this.workers.some((w) => w.fast)) {
      for (const w of this.workers.filter((x) => x.fast)) {
        this.releaseTarget(w)
        const site = this.plots[w.plot]
        if (site && w.carrying) for (let k = 0; k < w.held; k++) site.spawnRubble(w.carrying, this.time)
      }
      this.workers = this.workers.filter((w) => !w.fast)
      for (const site of this.plots) for (const d of site.dumpsters) d.queue = d.queue.filter((id) => id < 1000)
    }
  }

  // A small reward for sorting something out: about half a minute's income.
  private fixReward() {
    return Math.max(25, Math.round((this.snapshot?.incomePerMinute ?? 0) * 0.5))
  }

  // Knock a share of a building's bricks into rubble at once, starting
  // nearest `near` (local, world units).
  private knock(site: Site, share: number, min: number, near: { x: number; z: number } | null) {
    const n = Math.min(site.bricksLeft, Math.max(min, Math.ceil(site.bricksLeft * share)))
    for (let k = 0; k < n; k++) {
      const b = site.pickTopBrick(near)
      if (b < 0) break
      this.breakBrick(site, b)
    }
    return n
  }

  // The wrecking ball: a swing takes a chunk off the front corner.
  swingBall(plot: number): number {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing' || !this.useToolTurn('ball', 90_000)) return 0
    // Two swings: the bricks come off as the ball hits (see ToolFx timing).
    const now = Date.now()
    const near = { x: site.halfX, z: site.halfZ }
    this.pendingKnocks.push({ plot, at: now + BALL_HITS_MS[0], share: 0.025, min: 6, near }, { plot, at: now + BALL_HITS_MS[1], share: 0.025, min: 6, near })
    const n = 1
    this.toolFx = { plot, kind: 'ball', at: now }
    this.count('tool')
    this.save()
    this.markDirty()
    return n
  }

  // Dynamite: a bigger blast from the middle out.
  blast(plot: number): number {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing' || !this.useToolTurn('dynamite', 240_000)) return 0
    // The fuse burns first; the blast takes the bricks.
    const now = Date.now()
    this.pendingKnocks.push({ plot, at: now + DYNAMITE_BOOM_MS, share: 0.1, min: 25, near: null })
    const n = 1
    this.toolFx = { plot, kind: 'dynamite', at: now }
    this.count('tool')
    this.save()
    this.markDirty()
    return n
  }

  fixTruck(id: number): number {
    const t = this.trucks[id]
    if (!t || !t.broken) return 0
    t.broken = 0
    const reward = this.fixReward()
    this.scrap += reward
    this.count('fix')
    this.markDirty()
    return reward
  }

  wakeWorker(id: number): number {
    const w = this.workers.find((x) => x.id === id)
    if (!w || !w.onBreak) return 0
    w.onBreak = 0
    this.count('fix')
    this.markDirty()
    return 1
  }

  clearJam(): number {
    if (this.jamSince < 0) return 0
    this.jamSince = -1
    this.recalcManagers()
    const reward = this.fixReward()
    this.scrap += reward
    this.count('fix')
    this.markDirty()
    return reward
  }

  // The "bricks are falling" game: each catch is worth a few seconds of income.
  catchUnit() {
    return Math.max(3, Math.round((this.snapshot?.incomePerMinute ?? 0) / 12))
  }
  claimCatch(caught: number): number {
    if (Date.now() > this.catchOfferUntil + 60_000) return 0
    this.catchOfferUntil = 0
    const reward = Math.max(0, Math.min(60, caught)) * this.catchUnit()
    this.scrap += reward
    this.markDirty()
    return reward
  }
  takeCatchOffer() {
    // Started: the offer stays valid while they play.
    this.catchOfferUntil = Date.now() + 30_000
  }

  // Now and then something needs you: a truck breaks down, a worker sits
  // down for a break, or traffic jams up. A manager on the right station
  // sorts it out by themselves after a while.
  private tickHiccups(dt: number) {
    const hasTruckMgr = !!this.assigned.truck
    const hasCrewMgr = !!this.assigned.crew
    // Left alone, things sort themselves out eventually — just slower:
    // a manager on that station is much quicker than waiting.
    for (const t of this.trucks) {
      if (!t.broken) continue
      t.broken += dt
      if (t.broken > (hasTruckMgr ? 20 : 180)) t.broken = 0
    }
    for (const w of this.workers) {
      if (!w.onBreak) continue
      w.onBreak += dt
      if (w.onBreak > (hasCrewMgr ? 15 : 120)) w.onBreak = 0
    }
    if (this.jamSince >= 0 && this.time - this.jamSince > (hasTruckMgr ? 30 : 300)) {
      this.jamSince = -1
      this.recalcManagers()
    }
    if (this.time < this.nextHiccupAt || this.home.phase !== 'demolishing') return
    this.nextHiccupAt = this.time + 200 + Math.random() * 220
    const roll = Math.random()
    const driving = this.trucks.filter((t) => t.state === 'driving' && !t.broken)
    if (roll < 0.4 && driving.length && !this.trucks.some((t) => t.broken)) {
      driving[Math.floor(Math.random() * driving.length)].broken = 0.01
    } else if (roll < 0.75 && this.workers.length > 1 && !this.workers.some((w) => w.onBreak)) {
      const free = this.workers.filter((w) => !w.carrying && (w.state === 'idle' || w.state === 'toPick'))
      const w = free[Math.floor(Math.random() * free.length)]
      if (w) {
        if (w.target) this.releaseTarget(w)
        w.state = 'idle'
        w.onBreak = 0.01
      }
    } else if (this.jamSince < 0 && this.trucks.length) {
      this.jamSince = this.time
      this.recalcManagers()
    }
    this.markDirty()
  }

  private tickGoals() {
    const today = dayKey()
    if (this.goalDay.day !== today) this.goalDay = { day: today, base: { ...this.counters }, claimed: [false, false, false], bonus: false }
    if (!this.contract) this.newContract()
    if (!this.catchOfferUntil && Date.now() >= this.nextCatchAt && this.home.phase === 'demolishing') {
      this.catchOfferUntil = Date.now() + 30_000
      this.nextCatchAt = Date.now() + (8 + Math.random() * 6) * 60_000
      this.markDirty()
    }
    if (this.catchOfferUntil && Date.now() > this.catchOfferUntil + 60_000) this.catchOfferUntil = 0
  }

  todaysGoals() {
    return dailyGoals(this.goalDay.day || dayKey(), levelForXp(this.xp))
  }

  goalProgress(i: number) {
    const g = this.todaysGoals()[i]
    return g ? Math.min(g.target, this.counters[g.kind] - (this.goalDay.base[g.kind] ?? 0)) : 0
  }

  claimGoal(i: number): string | null {
    const g = this.todaysGoals()[i]
    if (!g || this.goalDay.claimed[i]) return 'Already claimed'
    if (this.goalProgress(i) < g.target) return 'Not done yet'
    this.goalDay.claimed[i] = true
    this.gems += g.gems
    this.save()
    this.markDirty()
    return null
  }

  // All three done: a bonus Iron chest.
  claimGoalBonus(): string | null {
    if (this.goalDay.bonus || this.goalDay.claimed.some((c) => !c)) return 'Finish all three first'
    this.goalDay.bonus = true
    this.chests.iron++
    this.save()
    this.markDirty()
    return null
  }

  // A contract: demolish one of the buildings you can do a few times.
  private newContract() {
    const level = levelForXp(this.xp)
    const pool = BUILDINGS.filter((b) => b.requiredLevel <= level && b.requiredLevel >= level - 4)
    const b = pool[Math.floor(Math.random() * pool.length)] ?? BUILDINGS[0]
    const target = b.requiredLevel >= level - 1 ? 2 : 3
    this.contract = { building: b.id, target, base: this.clearedById[b.id] ?? 0, chest: level >= 10 ? 'gold' : 'iron', gems: 10 + level }
  }

  contractProgress() {
    const c = this.contract
    return c ? Math.min(c.target, (this.clearedById[c.building] ?? 0) - c.base) : 0
  }

  claimContract(): string | null {
    const c = this.contract
    if (!c || this.contractProgress() < c.target) return 'Not done yet'
    this.chests[c.chest]++
    this.gems += c.gems
    this.contract = null
    this.newContract()
    this.save()
    this.markDirty()
    return null
  }

  // ── Managers, chests, gems ────────────────────────────────────────────

  managers: Record<string, { level: number; cards: number }> = {}
  assigned: Partial<Record<Slot, string>> = {}
  abilityReady: Partial<Record<Slot, number>> = {} // ms
  activeAbilities: { slot: Slot; id: AbilityId; until: number }[] = [] // ms
  chests: Record<ChestType, number> = { wood: 1, iron: 0, gold: 0 } // a first chest to open
  freeChestAt = 0 // ms
  gems = 0
  outfit: OutfitId = 'suit'
  outfits: OutfitId[] = ['suit']
  rewardedLevel = 1
  private automationAt = 0
  private upgradeAutoAt = 0

  // Boosts from the managers in their slots and any running abilities.
  recalcManagers() {
    const now = Date.now()
    this.activeAbilities = this.activeAbilities.filter((a) => a.until > now)
    MGR.walk = MGR.pick = MGR.truckSpeed = MGR.truckLoad = MGR.dumpster = 1
    MGR.unload = ISLANDS.map(() => 1)
    MGR.fork = ISLANDS.map(() => 1)
    MGR.pay = ISLANDS.map(() => 1)
    for (const [slot, id] of Object.entries(this.assigned) as [Slot, string][]) {
      const m = manager(id)
      const own = this.managers[id]
      if (!m || !own) continue
      const b = boostsAt(m, own.level, slot)
      const y = slot.startsWith('yard') ? Number(slot.slice(4)) : null
      MGR.walk *= b.walk ?? 1
      MGR.pick *= b.pick ?? 1
      MGR.truckSpeed *= b.truckSpeed ?? 1
      MGR.truckLoad *= b.truckLoad ?? 1
      MGR.dumpster *= b.dumpster ?? 1
      if (y !== null) {
        MGR.unload[y] *= b.unload ?? 1
        MGR.pay[y] *= b.pay ?? 1
      }
      if (slot.startsWith('fork')) {
        const fy = Number(slot.slice(4))
        MGR.fork[fy] *= b.fork ?? 1
      }
    }
    // A traffic jam slows every truck until someone waves it through.
    if (this.jamSince >= 0) MGR.truckSpeed *= 0.6
    for (const a of this.activeAbilities) {
      if (a.id === 'rally' || a.id === 'bossMode') {
        MGR.walk *= 3
        MGR.pick *= 3
      }
      if (a.id === 'express' || a.id === 'bossMode') MGR.truckSpeed *= 3
      if (a.id === 'bossMode') MGR.unload = MGR.unload.map((u) => u * 3)
      if (a.id === 'market') MGR.pay = MGR.pay.map((p) => p * 2)
      if (a.id === 'rush' || a.id === 'bossMode') MGR.fork = MGR.fork.map((f) => f * 3)
    }
  }

  // Put a manager in a slot (taking them out of any other), or clear it.
  assignManager(slot: Slot, id: string | null) {
    if (id) {
      const m = manager(id)
      if (!m || !this.managers[id] || !fits(m, slot)) return false
      for (const k of Object.keys(this.assigned) as Slot[]) if (this.assigned[k] === id) delete this.assigned[k]
      this.assigned[slot] = id
    } else delete this.assigned[slot]
    this.recalcManagers()
    this.save()
    this.markDirty()
    return true
  }

  levelUpManager(id: string): string | null {
    const m = manager(id)
    const own = this.managers[id]
    if (!m || !own) return 'Not hired'
    if (own.level >= 10) return 'Max level'
    const need = cardsToLevel(m, own.level)
    if (own.cards < need) return `Needs ${need} cards`
    const cost = levelUpCost(m, own.level)
    if (this.scrap < cost) return 'Not enough bricks'
    this.scrap -= cost
    own.cards -= need
    own.level++
    this.recalcManagers()
    this.save()
    this.markDirty()
    return null
  }

  claimFreeChest(): boolean {
    if (Date.now() < this.freeChestAt) return false
    this.chests.wood++
    this.freeChestAt = Date.now() + FREE_CHEST_HOURS * 3_600_000
    this.save()
    this.markDirty()
    return true
  }

  // Watched an ad for a Wooden chest (every half hour).
  adChest(): boolean {
    if (Date.now() < this.adCooldowns.chest) return false
    this.chests.wood++
    this.adCooldowns.chest = Date.now() + 30 * 60_000
    this.save()
    this.markDirty()
    return true
  }

  buyChest(type: ChestType): string | null {
    if (type === 'iron') {
      const price = chestBrickPrice(levelForXp(this.xp))
      if (this.scrap < price) return 'Not enough bricks'
      this.scrap -= price
    } else if (type === 'gold') {
      if (this.gems < GOLD_CHEST_GEMS) return 'Not enough gems'
      this.gems -= GOLD_CHEST_GEMS
    } else return 'Wooden chests are free'
    this.chests[type]++
    this.save()
    this.markDirty()
    return null
  }

  // Opens one chest: new managers join, duplicates become level-up cards.
  openChest(type: ChestType): { pulls: (Pull & { isNew: boolean })[]; gems: number } | null {
    if (this.chests[type] <= 0) return null
    this.chests[type]--
    const roll = rollChest(type)
    const pulls = roll.pulls.map((p) => {
      const own = this.managers[p.manager]
      if (!own) {
        this.managers[p.manager] = { level: 1, cards: 0 }
        return { ...p, isNew: true }
      }
      own.cards++
      return { ...p, isNew: false }
    })
    this.gems += roll.gems
    this.count('chest')
    // A brand-new manager goes straight into an empty slot that fits.
    for (const p of pulls) {
      if (!p.isNew) continue
      const m = manager(p.manager)!
      const slot = this.managerSlots().find((sl) => !this.assigned[sl] && fits(m, sl))
      if (slot) this.assigned[slot] = m.id
    }
    this.recalcManagers()
    this.save()
    this.markDirty()
    return { pulls, gems: roll.gems }
  }

  // The slots there are: the four stations plus each open island's yard.
  managerSlots(): Slot[] {
    return ['crew', 'truck', 'dumpster', 'tools', ...this.openYards().flatMap((y) => [`yard${y}` as Slot, `fork${y}` as Slot])]
  }

  useAbility(slot: Slot): string | null {
    const id = this.assigned[slot]
    const m = id ? manager(id) : null
    if (!m?.ability) return 'No ability'
    const ab = ABILITIES[m.ability]
    if (Date.now() < (this.abilityReady[slot] ?? 0)) return 'Not ready yet'
    if (ab.id === 'emptyAll') this.haulAllDumpsters()
    else if (ab.id === 'charge') this.blastBuildings()
    else this.activeAbilities.push({ slot, id: ab.id, until: Date.now() + ab.seconds * 1000 })
    this.abilityReady[slot] = Date.now() + ab.cooldownMinutes * 60_000
    this.recalcManagers()
    this.save()
    this.markDirty()
    return null
  }

  // Every plot's dumpsters hauled away and paid for at once.
  private haulAllDumpsters() {
    let bricks = 0
    let value = 0
    for (const site of this.plots) {
      const load = site.dumpsterLoad
      if (!load) continue
      const y = Math.max(0, ISLANDS.findIndex((s) => s.id === PLOT_SLOTS[site.id]?.island))
      value += load * site.building.brickValue * (1 + stats.priceBonus(this.yardU(y))) * (MGR.pay[y] ?? 1)
      bricks += load
      for (const d of site.dumpsters) d.load = 0
    }
    if (bricks) this.pay(bricks, value)
    for (const site of this.plots) this.checkCleared(site)
  }

  // A blast knocks a chunk (5%) off every building into rubble.
  private blastBuildings() {
    for (const site of this.plots) {
      if (site.phase !== 'demolishing') continue
      const n = Math.ceil(site.bricksLeft * 0.05)
      for (let k = 0; k < n; k++) {
        const b = site.pickTopBrick(null)
        if (b < 0) break
        const color = site.bricks[b].color
        site.removeBrick(b)
        site.spawnRubble(color, this.time)
      }
    }
  }

  // Managers running things for you, about once a second.
  private runAutomation() {
    const now = Date.now()
    if (now < this.automationAt || !this.plots.length) return
    this.automationAt = now + 1000
    if (this.activeAbilities.some((a) => a.until <= now)) this.recalcManagers()
    const auto = new Set<string>()
    for (const id of Object.values(this.assigned)) for (const a of (id && manager(id)?.automation) || []) auto.add(a)
    if (auto.has('claim'))
      for (const site of this.plots) {
        if (site.phase !== 'cleared') continue
        const last = site.building.id
        this.claimPlot(site.id)
        // …and starts the same building again if it can.
        if (auto.has('restart')) this.startBuilding(site.id, last)
      }
    if (auto.has('upgrade') && now >= this.upgradeAutoAt) {
      this.upgradeAutoAt = now + 20_000
      const keys: UpgradeKey[] = ['tools', 'speed', 'workers']
      const best = keys
        .filter((k) => !upgradeLock(k, this.upgrades, levelForXp(this.xp), this.truckCapacity()))
        .map((k) => ({ k, cost: upgradeCost(k, this.upgrades[k]) }))
        .sort((a, b) => a.cost - b.cost)[0]
      // Only small purchases, so it never drains your bricks.
      if (best && best.cost <= this.scrap * 0.2) this.buyUpgrade(best.k)
    }
  }

  // Level-up rewards: gems and a chest each level, a better one every 5.
  private checkLevelRewards() {
    const level = levelForXp(this.xp)
    while (this.rewardedLevel < level) {
      this.rewardedLevel++
      this.gems += 5
      this.chests[this.rewardedLevel % 5 === 0 ? 'iron' : 'wood']++
      if (!this.frozen)
        this.notices.push({
          title: `Level ${this.rewardedLevel}!`,
          detail: `+5 gems and a ${this.rewardedLevel % 5 === 0 ? 'Iron' : 'Wooden'} chest`,
          message: null,
          emoji: '🎁',
          button: 'Nice!',
        })
      this.markDirty()
    }
  }

  buyOutfit(id: OutfitId): string | null {
    if (this.outfits.includes(id)) {
      this.outfit = id
    } else {
      const o = OUTFITS.find((x) => x.id === id)
      if (!o) return 'No such outfit'
      if (this.gems < o.gems) return 'Not enough gems'
      this.gems -= o.gems
      this.outfits = [...this.outfits, id]
      this.outfit = id
    }
    this.save()
    this.markDirty()
    return null
  }

  islandOpen(id: IslandId) {
    return this.grown[id] >= 0
  }

  openYards(): number[] {
    return ISLANDS.filter((s) => this.islandOpen(s.id)).map((s) => s.index)
  }

  // The upgrades as seen from one yard (its own yard levels).
  yardU(y: number): Upgrades {
    const l = this.yardLevels[y] ?? NEW_YARD
    return { ...this.upgrades, yardSize: l.size, yardDocks: l.docks, yardSpeed: l.speed, yardBonus: l.bonus, forkSpeed: l.forkSpeed, forkPallet: l.forkPallet, forkCount: l.forkCount, shipCap: l.shipCap, shipSpeed: l.shipSpeed, yardMax: ISLANDS[y]?.yard.maxSize, yardIndex: y }
  }

  // Parking bays across every open yard.
  truckCapacity() {
    return this.openYards().reduce((n, y) => n + stats.yardCapacity(this.yardU(y)), 0)
  }

  // A truck's bay number at its home yard (by order among that yard's trucks).
  private parkRank(truck: { id: number; home: number }) {
    return this.trucks.filter((t) => t.home === truck.home && t.id < truck.id).length
  }

  // A truck its home yard has no bay for parks at the kerb out front.
  private kerbIndex(truck: { id: number; home: number }): number | null {
    const cap = stats.yardCapacity(this.yardU(truck.home))
    const rank = this.parkRank(truck)
    return rank >= cap ? rank - cap : null
  }

  // Where a new truck lives: the first open yard with a free bay.
  private homeForNewTruck(): number {
    const open = this.openYards()
    for (const y of open) if (this.trucks.filter((t) => t.home === y).length < stats.yardCapacity(this.yardU(y))) return y
    return open[open.length - 1] ?? 0
  }

  // The yard to unload at: the one on the island the truck is on (if it's
  // open), else its home yard.
  private unloadYard(truck: Truck): number {
    const here = islandAt(truck.x, truck.z)
    return here && this.islandOpen(here.id) ? here.index : truck.home
  }

  private newTruck(id: number, levels?: { load: number; speed: number; home?: number }): Truck {
    const home = levels?.home ?? this.homeForNewTruck()
    const kerb = this.kerbIndex({ id, home })
    const road = kerb === null ? null : kerbSpot(home, kerb)
    const spot = road ? { x: road.x, z: road.line - KERB_INSET } : parkingSpot(home, this.parkRank({ id, home }))
    return {
      id,
      load: levels?.load ?? 0,
      speed: levels?.speed ?? 0,
      state: 'parked',
      x: spot.x,
      z: spot.z,
      heading: road ? Math.PI / 2 : 0,
      path: [],
      dest: { kind: 'park' },
      at: road ?? yardGateOut(home),
      home,
      yard: home,
      inYard: road ? null : 'parked',
      dock: 0,
      stuck: 0,
      squeeze: 0,
      broken: 0,
      lap: 0,
      timer: 0,
      cargo: 0,
      cargoValue: 0,
    }
  }

  private syncWorkers() {
    while (this.trucks.length < stats.truckCount(this.upgrades)) this.trucks.push(this.newTruck(this.trucks.length))
    const want = stats.workerCount(this.upgrades)
    const start = this.plots.find((p) => p.phase === 'demolishing') ?? this.home
    // (Ad helpers don't count, and have their own ids from 1000.)
    while (this.workers.filter((w) => !w.fast).length < want) {
      const id = this.workers.filter((w) => !w.fast).length
      this.workers.push(this.newWorker(id, start.id))
    }
  }

  // After an admin takes workers or trucks away: drop the extras. A worker's
  // claimed brick goes back up for grabs and it leaves any dumpster line.
  private trimCrew() {
    const wantTrucks = stats.truckCount(this.upgrades)
    if (this.trucks.length > wantTrucks) this.trucks = this.trucks.slice(0, wantTrucks)
    const want = stats.workerCount(this.upgrades)
    const crew = this.workers.filter((w) => !w.fast)
    if (crew.length <= want) return
    const gone = new Set(crew.slice(want).map((w) => w.id))
    for (const w of this.workers) if (gone.has(w.id)) this.releaseTarget(w)
    this.workers = this.workers.filter((w) => !gone.has(w.id))
    for (const site of this.plots) for (const d of site.dumpsters) d.queue = d.queue.filter((id) => !gone.has(id))
  }

  private newWorker(id: number, plot: number): Worker {
    return {
      id,
      plot,
      x: DUMPSTER.x + (id % 5) * 0.5 - 1,
      z: DUMPSTER.z - 0.6,
      heading: Math.PI,
      state: 'idle',
      tx: 0,
      tz: 0,
      target: null,
      timer: 0,
      carrying: null,
      held: 0,
      dumpster: 0,
      via: [],
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────

  load() {
    try {
    } catch {
      // unreadable — the next sync says
    }
    this.loadSave()
    try {
      const resetMessage = localStorage.getItem(RESET_NOTICE_KEY)
      if (resetMessage !== null) {
        localStorage.removeItem(RESET_NOTICE_KEY)
        this.notices.push({ title: 'Fresh start', detail: 'Your progress was reset', message: resetMessage || null })
      }
      if (localStorage.getItem(RESTORE_NOTICE_KEY) !== null) {
        localStorage.removeItem(RESTORE_NOTICE_KEY)
        this.notices.push({ title: 'Progress restored', detail: 'Support put your game back to an earlier save', message: null })
      }
      const ban = localStorage.getItem(BAN_KEY)
      if (ban) this.setBan(JSON.parse(ban) as Ban)
      const pending = localStorage.getItem(PENDING_GRANTS_KEY)
      if (pending) {
        localStorage.removeItem(PENDING_GRANTS_KEY)
        for (const g of JSON.parse(pending) as (Reward & { message: string | null; source: string })[]) {
          this.applyReward(g, g.message, g.source)
        }
      }
    } catch {
      // nothing pending
    }
  }

  // A read-only copy of someone's game from their cloud save (the admin's
  // "watch" view): it runs, but never saves or logs anything.
  static viewer(save: SaveData): Engine {
    const e = new Engine()
    e.frozen = true
    e.loadSave(save)
    return e
  }

  private loadSave(given?: SaveData) {
    let save: SaveData | null = given ?? null
    if (!given) {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        if (raw) save = JSON.parse(raw) as SaveData
        else {
          const legacy = localStorage.getItem(LEGACY_SAVE_KEY)
          if (legacy) save = migrateLegacy(JSON.parse(legacy) as LegacySave)
        }
      } catch {
        save = null
      }
    }

    if (!save || !save.plots?.length) {
      const home = new Site(0)
      home.phase = 'demolishing'
      home.loadBuilding(BUILDINGS[0])
      this.plots = [home]
      this.syncWorkers()
      return
    }

    this.scrap = save.scrap
    this.xp = save.xp
    // Before per-truck levels, there was one shared "truck" upgrade: it
    // becomes the first truck's load level.
    // Likewise the one shared "dumpster" upgrade becomes each plot's first
    // dumpster's level.
    const {
      truck: oldTruckLevel,
      dumpster: oldDumpsterLevel,
      ...upgrades
    } = save.upgrades as Upgrades & { truck?: number; dumpster?: number }
    this.upgrades = { ...this.upgrades, ...upgrades }
    this.sitesCleared = save.sitesCleared ?? 0
    this.yardBuild = save.yardBuild && typeof save.yardBuild.yard === 'number' ? save.yardBuild : null
    this.grown = { ...START_GROWN, ...save.grown }
    setGrown(this.grown)
    this.landBuild = save.landBuild ?? null
    this.adCooldowns = { freeUpgrade: 0, dumpsters: 0, chest: 0, ...save.adCooldowns }
    if (save.you) {
      this.toolReady = { ...{ ball: 0, dynamite: 0 }, ...save.you.toolReady }
      this.toolCharges = { ...{ ball: 0, dynamite: 0 }, ...save.you.toolCharges }
      this.counters = { ...ZERO_COUNTERS, ...save.you.counters }
      this.goalDay = save.you.goalDay ?? this.goalDay
      this.contract = save.you.contract ?? null
      this.clearedById = save.you.clearedById ?? {}
      this.helpersUntil = save.you.helpersUntil ?? 0
    }
    if (save.mgr) {
      this.managers = save.mgr.managers ?? {}
      this.assigned = save.mgr.assigned ?? {}
      this.abilityReady = save.mgr.abilityReady ?? {}
      this.chests = { ...{ wood: 0, iron: 0, gold: 0 }, ...save.mgr.chests }
      this.freeChestAt = save.mgr.freeChestAt ?? 0
      this.gems = save.mgr.gems ?? 0
      this.outfit = save.mgr.outfit ?? 'suit'
      this.outfits = save.mgr.outfits ?? ['suit']
      this.rewardedLevel = save.mgr.rewardedLevel ?? levelForXp(save.xp ?? 0)
    } else this.rewardedLevel = levelForXp(save.xp ?? 0)
    this.recalcManagers()
    if (save.yardOps) this.yardOps = ISLANDS.map((_, i) => ({ ...newOps(), ...(save.yardOps![i] ?? {}), forks: [] }))
    if (save.yards) this.yardLevels = ISLANDS.map((_, i) => ({ ...NEW_YARD, ...(save.yards![i] ?? {}) }))
    if (this.yardBuild || this.landBuild) {
      this.checkYardBuild()
      this.checkLandBuild()
    }
    this.crewPlan = save.crewPlan ?? null
    this.trucks = (save.trucks ?? [{ load: oldTruckLevel ?? 0, speed: 0 }]).map((t, id) => this.newTruck(id, t))
    this.plots = save.plots.slice(0, PLOT_SLOTS.length).map((ps, id) => {
      const site = new Site(id)
      site.phase = ps.phase
      site.worked = ps.worked ?? 0
      site.dumpsters = (ps.dumpsters ?? [{ level: oldDumpsterLevel ?? 0, load: ps.dumpsterLoad ?? 0 }])
        .slice(0, MAX_DUMPSTERS)
        .map((d) => ({ level: d.level, load: d.load, queue: [] }))
      if (ps.custom) registerCustomBuildings([ps.custom], false)
      let def = ps.custom ?? getBuilding(ps.buildingId)
      // Started before this building was redesigned: finish the old one.
      const old = ps.phase !== 'empty' && !ps.custom ? legacyOf(def.id) : null
      if (old && savedBrickBytes(ps.removed) === Math.ceil(brickCount(old) / 8) && savedBrickBytes(ps.removed) !== Math.ceil(brickCount(def) / 8)) def = old
      if (ps.phase === 'empty') {
        site.building = def
      } else {
        site.loadBuilding(def, decodeBits(ps.removed, brickCount(def)))
        for (let i = 0; i < ps.rubble; i++) site.spawnRubble(site.bricks[0]?.color ?? 'brick', 0)
      }
      return site
    })
    this.syncWorkers()
    if (!given) this.moveBigToHarbour()

    if (!given) this.beginCatchUp((Date.now() - save.lastSeen) / 1000)
  }

  // Once a reset starts, nothing may write the old progress back.
  private frozen = false

  save() {
    if (this.frozen) return
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.saveData()))
    } catch {
      // storage full / private mode — the game still runs, just won't persist
    }
  }

  // The save as plain data: written to localStorage and synced to the
  // player's cloud record.
  saveData(): SaveData {
    return {
      scrap: this.scrap,
      xp: this.xp,
      upgrades: this.upgrades,
      crewPlan: this.crewPlan,
      sitesCleared: this.sitesCleared,
      lastSeen: Date.now(),
      yardBuild: this.yardBuild,
      yards: this.yardLevels,
      yardOps: this.yardOps.map((o) => ({ pile: o.pile, pileValue: o.pileValue, ship: o.ship })),
      grown: this.grown,
      landBuild: this.landBuild,
      adCooldowns: this.adCooldowns,
      you: {
        toolReady: this.toolReady,
        toolCharges: this.toolCharges,
        counters: this.counters,
        goalDay: this.goalDay,
        contract: this.contract,
        clearedById: this.clearedById,
        helpersUntil: this.helpersUntil,
      },
      mgr: {
        managers: this.managers,
        assigned: this.assigned,
        abilityReady: this.abilityReady,
        chests: this.chests,
        freeChestAt: this.freeChestAt,
        gems: this.gems,
        outfit: this.outfit,
        outfits: this.outfits,
        rewardedLevel: this.rewardedLevel,
      },
      trucks: this.trucks.map((t) => ({ load: t.load, speed: t.speed, home: t.home })),
      plots: this.plots.map((p) => ({
        phase: p.phase,
        buildingId: p.building.id,
        removed: encodeBits(p.removed),
        // Carried bricks go back on the ground on reload rather than vanishing.
        rubble: p.rubble.length + this.workers.reduce((n, w) => n + (w.plot === p.id ? w.held : 0), 0),
        dumpsters: p.dumpsters.map((d) => ({ level: d.level, load: d.load })),
        ...(p.building.shape && p.phase !== 'empty' ? { custom: p.building } : {}),
        ...(p.phase !== 'empty' ? { worked: Math.round(p.worked) } : {}),
      })),
    }
  }

  // ── Gifts & codes ─────────────────────────────────────────────────────

  // Shown one at a time by the HUD (see Snapshot.notice).
  notices: Notice[] = []
  // The player's public id and username from the cloud (null until the
  // first sync / until they pick a name).
  shortId: string | null = null
  username: string | null = null

  // Applies a reward from an admin gift, a balance edit or a redeem code,
  // and queues a notice telling the player what they got.
  applyReward(r: Reward, message: string | null, source: string) {
    if (r.kind === 'reset') {
      // Wipe the save and start over (keeping the player id and username).
      this.frozen = true
      try {
        localStorage.removeItem(SAVE_KEY)
        localStorage.removeItem(LEGACY_SAVE_KEY)
        localStorage.setItem(RESET_NOTICE_KEY, message ?? '')
      } catch {
        // storage unavailable — nothing saved to wipe
      }
      window.location.reload()
      return
    }
    if (r.kind === 'rain') {
      // An admin made it rain for this player for a while (no popup).
      this.rainUntil = Math.max(Date.now(), this.rainUntil) + Math.max(0, Number(r.amount) || 0) * 60_000
      this.markDirty()
      return
    }
    if (r.kind === 'restore') {
      // Swap in a backed-up save (an admin undoing a mistake).
      if (!r.data || typeof r.data !== 'object') return
      this.frozen = true
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ ...(r.data as SaveData), lastSeen: Date.now() }))
        localStorage.setItem(RESTORE_NOTICE_KEY, '1')
      } catch {
        // storage unavailable — can't restore on this device
      }
      window.location.reload()
      return
    }
    // Admins can send negative amounts to take things away.
    const raw = Number(r.amount) || 0
    const amount = r.kind === 'set_bricks' || r.kind === 'set_level' ? Math.max(0, raw) : raw
    const taken = amount < 0
    let what = ''
    switch (r.kind) {
      case 'bricks':
        this.scrap = Math.max(0, this.scrap + amount)
        what = `${taken ? '−' : '+'}🧱${Math.round(Math.abs(amount)).toLocaleString()} bricks`
        break
      case 'set_bricks':
        this.scrap = amount
        what = `Your bricks were set to 🧱${Math.round(amount).toLocaleString()}`
        break
      case 'set_level': {
        // Start of that level (XP is total bricks hauled).
        const lv = Math.max(1, Math.round(amount))
        this.xp = xpForLevel(lv)
        what = `Your level was set to ${lv}`
        break
      }
      case 'boost':
        // Minutes of crew boost, on top of any boost already running.
        if (taken) this.boostUntil = Math.max(this.time, this.boostUntil + amount * 60)
        else this.boostUntil = Math.max(this.boostUntil, this.time) + amount * 60
        what = taken ? `⚡ ${-amount} min of crew boost removed` : `⚡ ${amount} min crew boost`
        break
      case 'upgrade': {
        const key = r.upgrade as UpgradeKey | null
        if (!key || !(key in this.upgrades)) return
        const n = Math.round(amount)
        const label = REWARD_UPGRADE_LABELS[key] ?? UPGRADE_INFO[key].label
        if (isYardKey(key)) {
          // Yard upgrades go to the newest island's yard.
          const y = this.openYards().at(-1) ?? 0
          const f = YARD_FIELD[key]
          this.yardLevels[y][f] = Math.max(0, this.yardLevels[y][f] + n)
        } else this.upgrades = { ...this.upgrades, [key]: Math.max(0, this.upgrades[key] + n) }
        this.syncWorkers()
        this.trimCrew()
        what = taken ? `${-n} ${label}${n < -1 ? ' upgrades' : ''} removed` : `${n} free ${label}${n > 1 ? ' upgrades' : ''}`
        break
      }
      default:
        return
    }
    const title = taken ? 'Your account was updated' : source === 'code' ? 'Code redeemed!' : 'You got a gift!'
    this.notices.push({ title, detail: what, message })
    this.save()
    this.markDirty()
  }

  // True once the cloud has answered at least once (so the HUD knows
  // whether "no username" really means none, for the first-play prompt).
  synced = false

  markSynced() {
    if (this.synced) return
    this.synced = true
    this.markDirty()
  }

  // A ban from the cloud (or null once lifted). Remembered on the device so
  // the block screen shows even before the next sync.
  ban: Ban | null = null

  setBan(ban: Ban | null) {
    // A temporary ban that has run out is no ban.
    const live = ban && (ban.until === null || new Date(ban.until).getTime() > Date.now()) ? ban : null
    if (JSON.stringify(live) === JSON.stringify(this.ban)) return
    this.ban = live
    try {
      if (live) localStorage.setItem(BAN_KEY, JSON.stringify(live))
      else localStorage.removeItem(BAN_KEY)
    } catch {
      // fine — it comes back on the next sync
    }
    this.markDirty()
  }

  setUsername(name: string | null) {
    if (name === this.username) return
    this.username = name
    this.markDirty()
  }

  setShortId(id: string | null) {
    if (id === this.shortId) return
    this.shortId = id
    this.markDirty()
  }

  dismissNotice() {
    this.notices.shift()
    this.markDirty()
  }

  // Events and messages from the last sync. New ones pop up once (events
  // when they start; popup-style messages); banner messages show until
  // they end or the player closes them.
  banners: Broadcast[] = []

  setLive(events: LiveEvent[], broadcasts: Broadcast[]) {
    liveEvents = events
    const seen = new Set(readList(SEEN_LIVE_KEY))
    const now = Date.now()
    for (const e of events) {
      if (e.kind === 'rain' || seen.has(e.id) || new Date(e.startsAt).getTime() > now) continue
      seen.add(e.id)
      const info = eventInfo(e.kind)
      this.notices.push({ title: eventTitle(e.kind, e.value), detail: eventDetail(e.kind, e.value), message: null, emoji: info.emoji, button: "Let's go!" })
    }
    for (const b of broadcasts) {
      if (b.style !== 'popup' || seen.has(b.id)) continue
      seen.add(b.id)
      this.notices.push({ title: b.title, detail: b.body ?? '', message: null, emoji: '📣', button: 'OK' })
    }
    writeList(SEEN_LIVE_KEY, [...seen].slice(-200))
    const dismissed = new Set(readList(DISMISSED_KEY))
    this.banners = broadcasts.filter((b) => b.style === 'banner' && !dismissed.has(b.id))
    this.markDirty()
  }

  dismissBanner(id: string) {
    writeList(DISMISSED_KEY, [...readList(DISMISSED_KEY), id].slice(-200))
    this.banners = this.banners.filter((b) => b.id !== id)
    this.markDirty()
  }

  // What the player's cloud record shows in the admin.
  cloudSummary() {
    return {
      scrap: this.scrap,
      xp: this.xp,
      level: levelForXp(this.xp),
      plots: this.plots.length,
      workers: this.workers.length,
      sitesCleared: this.sitesCleared,
    }
  }

  // Building starts and finishes waiting to go up with the next cloud sync
  // (the admin activity log and building stats). Kept in storage so a
  // closed tab doesn't lose them.
  private activity: ActivityEvent[] = loadActivity()

  private logActivity(e: Omit<ActivityEvent, 'at'>) {
    if (this.frozen) return // a viewer copy, or mid-reset
    this.activity = [...this.activity, { ...e, at: Date.now() }].slice(-200)
    storeActivity(this.activity)
  }

  takeActivity(): ActivityEvent[] {
    const out = this.activity
    this.activity = []
    storeActivity(this.activity)
    return out
  }

  // A sync failed: put them back in front of anything logged since.
  returnActivity(events: ActivityEvent[]) {
    this.activity = [...events, ...this.activity].slice(-200)
    storeActivity(this.activity)
  }

  // ── Time away ─────────────────────────────────────────────────────────
  //
  // Time spent away (app closed or in the background) is replayed with the
  // real simulation, a slice at a time so the screen never freezes (see
  // useEngine), so you come back to exactly what would have happened. If a
  // huge stretch would take too long to replay, the rest is filled in at
  // the pace actually measured during the replay.

  private catchUpLeft = 0
  private catchUpTotal = 0
  private catchUpStartScrap = 0
  private catchUpSpentMs = 0
  private catchUpReplayed = 0
  private catchUpStartBricks: number[] = []
  private replaying = false

  beginCatchUp(seconds: number) {
    // Banned time doesn't count as time away.
    if (this.ban) return
    const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, seconds))
    if (away < 5) return
    if (this.catchUpLeft > 0) {
      this.catchUpLeft += away
      this.catchUpTotal += away
      return
    }
    this.catchUpLeft = away
    this.catchUpTotal = away
    this.catchUpStartScrap = this.scrap
    this.catchUpSpentMs = 0
    this.catchUpReplayed = 0
    this.catchUpStartBricks = this.plots.map((p) => p.bricksLeft)
    this.markDirty()
  }

  catchingUp() {
    return this.catchUpLeft > 0
  }

  // Replays up to `budgetMs` of computing; true once all time away is done.
  stepCatchUp(budgetMs: number): boolean {
    if (this.catchUpLeft <= 0) return true
    const start = performance.now()
    this.replaying = true
    try {
      while (this.catchUpLeft > 0 && performance.now() - start < budgetMs) {
        for (let i = 0; i < 50 && this.catchUpLeft > 0; i++) {
          const dt = Math.min(0.1, this.catchUpLeft)
          simClockOffsetMs = this.catchUpLeft * 1000
          this.tick(dt)
          this.catchUpLeft -= dt
          this.catchUpReplayed += dt
        }
      }
    } finally {
      this.replaying = false
      simClockOffsetMs = 0
    }
    // Skip the flying-brick effects for replayed time.
    for (const site of this.plots) site.events.length = 0
    this.catchUpSpentMs += performance.now() - start
    if (this.catchUpLeft > 0 && this.catchUpSpentMs > MAX_REPLAY_MS) this.estimateRest()
    if (this.catchUpLeft <= 0) this.finishCatchUp()
    this.markDirty()
    return this.catchUpLeft <= 0
  }

  // The rest of a very long absence, at each plot's measured replay pace.
  private estimateRest() {
    const seconds = this.catchUpLeft
    // Pay at the middle of the estimated stretch for any events.
    simClockOffsetMs = (seconds / 2) * 1000
    const u = this.upgrades
    this.plots.forEach((site, i) => {
      if (site.phase !== 'demolishing' || this.catchUpReplayed <= 0) return
      const pace = Math.max(0, (this.catchUpStartBricks[i] ?? site.bricksLeft) - site.bricksLeft) / this.catchUpReplayed
      const available = site.bricksLeft + site.rubble.length + site.dumpsterLoad
      let hauled = Math.min(Math.floor(pace * seconds), available)
      const total = hauled
      site.worked += pace > 0 ? Math.min(seconds, total / pace) : seconds
      if (total <= 0) return
      for (const d of site.dumpsters) {
        const take = Math.min(hauled, d.load)
        d.load -= take
        hauled -= take
      }
      const fromRubble = Math.min(hauled, site.rubble.length)
      site.rubble.splice(0, fromRubble)
      hauled -= fromRubble
      while (hauled > 0) {
        const b = site.pickTopBrick(null)
        if (b < 0) break
        site.removeBrick(b)
        hauled--
      }
      this.pay(total, total * site.building.brickValue * (1 + stats.priceBonus(u)))
      this.checkCleared(site)
    })
    this.time += seconds
    this.catchUpLeft = 0
    simClockOffsetMs = 0
  }

  private finishCatchUp() {
    this.offlineEarnings += Math.max(0, Math.round(this.scrap - this.catchUpStartScrap))
    this.catchUpTotal = 0
    for (const site of this.plots) site.events.push({ type: 'resync' })
    this.save()
  }

  // The game loop's tick: paused while time away is being replayed.
  frameTick(dt: number) {
    // Nothing happens while time away is replayed, or while banned.
    if (this.catchUpLeft > 0 || this.ban) return
    this.tick(dt)
  }


  // ── Player actions ────────────────────────────────────────────────────

  boostUntil = -Infinity
  private lastBoostSecond = -1

  boostActive() {
    return this.time < this.boostUntil
  }

  private boostMul() {
    return (this.boostActive() ? BOOST_FACTOR : 1) * eventMultiplier('crew_boost')
  }

  boost() {
    // Tops up to at least a few seconds; never shortens a longer boost
    // (e.g. minutes from a gift or code).
    this.boostUntil = Math.max(this.boostUntil, this.time + BOOST_SECONDS)
    this.markDirty()
  }


  private breakBrick(site: Site, i: number) {
    const pos = site.brickWorld(i)
    site.removeBrick(i)
    const r = site.spawnRubble(site.bricks[i].color, this.time + BREAK_FALL_SECONDS, pos)
    site.events.push({ type: 'brickBroken', index: i, toX: r.x, toZ: r.z })
    site.events.push({ type: 'rubbleSpawned', id: r.id })
    this.markDirty()
  }

  // The BREAK button: one brick off the top of the building. No cooldown.
  breakTap(plot: number) {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing') return 0
    let broke = 0
    for (let n = 0; n < stats.bricksPerTap(); n++) {
      const i = site.pickTopBrick(null)
      if (i < 0) break
      this.breakBrick(site, i)
      broke++
    }
    this.count('tap', broke)
    return broke
  }

  // Tapping the building: knock out the brick where you tapped. Bricks only
  // leave from the top of their column (nothing ever floats), so it's the
  // top of the tapped column — tap the same spot to carve down. If a worker
  // already has that one, the nearest free top brick goes instead.
  breakBrickAt(plot: number, index: number) {
    const site = this.plots[plot]
    if (!site || site.phase !== 'demolishing' || !site.bricks[index]) return 0
    const c = site.brickColumn[index]
    let i = site.columnTop[c] >= 0 ? site.columns[c][site.columnTop[c]] : -1
    if (i < 0 || site.claimed[i]) {
      const p = site.brickWorld(index)
      i = site.pickTopBrick({ x: p.x, z: p.z })
    }
    if (i < 0) return 0
    this.breakBrick(site, i)
    this.count('tap')
    return 1
  }

  // ── Yard expansion (built over time) ─────────────────────────────────

  yardBuild: YardBuild | null = null

  // Finishes the expansion once its time is up (called every tick, and
  // after loading so time away counts).
  private checkYardBuild() {
    const b = this.yardBuild
    if (!b || Date.now() < b.endsAt) return
    this.yardBuild = null
    const l = this.yardLevels[b.yard]
    if (l && l.size < b.level) l.size = b.level
    const size = stats.yardSize(this.yardU(b.yard))
    if (!this.frozen)
      this.notices.push({ title: `${ISLANDS[b.yard].yard.name} expanded!`, detail: `Room for ${yardCapacity(size)} trucks there now`, message: null, emoji: '🏗️', button: 'Nice!' })
    this.save()
    this.markDirty()
  }

  // Rain an admin sent this player, until (real-world ms).
  rainUntil = 0

  // ── Growing the islands ───────────────────────────────────────────────
  //
  // Each island grows a stage at a time: pay, wait while the crew builds,
  // and the new land rises from the sea. Stage 0 of the next island is the
  // bridge to it, which needs the island before it fully grown.

  // The next stage of an island, if it has one.
  nextStage(id: IslandId): number | null {
    const s = ISLANDS.find((i) => i.id === id)!
    const next = this.grown[id] + 1
    return next <= lastStage(s) ? next : null
  }

  // Why the island can't grow now, if so.
  growLock(id: IslandId): string | null {
    const s = ISLANDS.find((i) => i.id === id)!
    const stage = this.nextStage(id)
    if (stage === null) return 'Fully grown'
    const st = s.stages[stage]
    if (!st) return 'Fully grown'
    if (stage === 0) {
      const prev = ISLANDS[s.index - 1]
      if (prev && this.grown[prev.id] < lastStage(prev)) return `Grow the ${prev.name} all the way first`
    }
    if (this.landBuild) return this.landBuild.island === id ? 'Building…' : 'Already building elsewhere'
    if (levelForXp(this.xp) < st.level) return `Lv ${st.level}`
    if (this.scrap < buildPrice(st.cost)) return 'Not enough bricks'
    return null
  }

  grow(id: IslandId): string | null {
    const why = this.growLock(id)
    if (why) return why
    const s = ISLANDS.find((i) => i.id === id)!
    const stage = this.nextStage(id)!
    const st = s.stages[stage]!
    this.scrap -= buildPrice(st.cost)
    const now = Date.now()
    this.landBuild = { island: id, stage, startedAt: now, endsAt: now + st.buildMinutes * 60_000 }
    this.save()
    this.markDirty()
    return null
  }

  private checkLandBuild() {
    const b = this.landBuild
    if (!b || Date.now() < b.endsAt) return
    this.landBuild = null
    this.grown = { ...this.grown, [b.island]: Math.max(this.grown[b.island], b.stage) }
    setGrown(this.grown)
    const s = ISLANDS.find((i) => i.id === b.island)!
    if (!this.frozen)
      this.notices.push(
        b.stage === 0
          ? { title: 'Bridge open!', detail: `The ${s.name} is open — new plots, buildings and the ${s.yard.name}`, message: null, emoji: '🌉', button: "Let's go!" }
          : { title: `${s.name} grew!`, detail: 'New land rose from the sea — with new plots for sale', message: null, emoji: s.emoji, button: 'Nice!' }
      )
    this.save()
    this.markDirty()
  }

  // A watched ad: a quarter of the full build time off.
  speedUpLand() {
    const b = this.landBuild
    if (!b) return
    b.endsAt -= (b.endsAt - b.startedAt) * LAND_AD_SHARE
    this.checkLandBuild()
    this.save()
    this.markDirty()
  }

  // A watched ad: knock a quarter of the full build time off.
  speedUpYard() {
    const b = this.yardBuild
    if (!b) return
    b.endsAt -= yardBuildSeconds(b.level + 1) * 1000 * YARD_AD_SHARE
    this.checkYardBuild()
    this.save()
    this.markDirty()
  }

  // `yard`: which island's yard, for yard upgrades.
  buyUpgrade(key: UpgradeKey, yard = 0): boolean {
    const u = isYardKey(key) ? this.yardU(yard) : this.upgrades
    if (isYardKey(key) && !this.islandOpen(ISLANDS[yard]?.id ?? 'houses')) return false
    const cost = upgradeCost(key, u[key])
    if (this.scrap < cost || upgradeLock(key, u, levelForXp(this.xp), this.truckCapacity())) return false
    if (key === 'yardSize') {
      // Expansions are built over time, not instantly (one at a time).
      if (this.yardBuild) return false
      this.scrap -= cost
      const now = Date.now()
      const level = u.yardSize + 1
      this.yardBuild = { yard, level, startedAt: now, endsAt: now + yardBuildSeconds(level + 1) * 1000 }
      this.save()
      this.markDirty()
      return true
    }
    if (isYardKey(key)) {
      this.scrap -= cost
      this.yardLevels[yard][YARD_FIELD[key]]++
      this.markDirty()
      return true
    }
    this.scrap -= cost
    this.count('upgrade')
    this.upgrades = { ...this.upgrades, [key]: this.upgrades[key] + 1 }
    this.syncWorkers()
    this.markDirty()
    return true
  }

  startBuilding(plot: number, id: string): string | null {
    const site = this.plots[plot]
    if (!site || site.phase !== 'empty') return 'This plot is busy'
    const def = getBuilding(id)
    if (def.id !== id || (def.shape && !def.available)) return "That building isn't available right now"
    if (levelForXp(this.xp) < def.requiredLevel) return `Reach level ${def.requiredLevel} first`
    if (def.harbour && !PLOT_SLOTS[plot]?.harbour) return 'Too big for a city plot — build it on a harbour lot'
    if ((def.island ?? 'city') !== PLOT_SLOTS[plot]?.island) return 'That building belongs on another island'
    const price = buildPrice(def.contractCost)
    if (this.scrap < price) return 'Not enough bricks for this contract'
    this.scrap -= price
    site.phase = 'demolishing'
    site.rubble = []
    site.worked = 0
    site.loadBuilding(def)
    this.logActivity({ kind: 'building_started', building: def.id, name: def.name })
    this.save()
    this.markDirty()
    return null
  }

  // Tap the cleared site: collect the completion bonus. The plot is then
  // empty, and the HUD opens the building picker for it.
  claimPlot(plot: number): number {
    const site = this.plots[plot]
    if (!site || site.phase !== 'cleared') return 0
    const bonus = Math.round(site.building.bonus * PACE.pay)
    this.scrap += bonus
    this.sitesCleared++
    site.phase = 'empty'
    site.clearBricks()
    this.save()
    this.markDirty()
    return bonus
  }

  // Plots unlock in order; the next one up for sale is plots.length.
  buyPlot(): string | null {
    const slot = PLOT_SLOTS[this.plots.length]
    if (!slot) return 'No more plots for sale'
    if (this.grown[slot.island] < slot.stage) return slot.stage === 0 ? `Build the bridge to the ${ISLANDS.find((s) => s.id === slot.island)!.name} first` : 'Grow the island to reach this plot'
    if (levelForXp(this.xp) < slot.requiredLevel) return `Reach level ${slot.requiredLevel} first`
    const price = buildPrice(slot.cost)
    if (this.scrap < price) return 'Not enough bricks'
    this.scrap -= price
    const site = new Site(slot.id)
    this.plots.push(site)
    if (this.crewPlan) this.crewPlan.push(0)
    this.moveBigToHarbour()
    this.save()
    this.markDirty()
    return null
  }

  // A harbour-sized building being demolished on a city plot (from before
  // the harbour existed) moves to an empty harbour lot, progress and all.
  private moveBigToHarbour() {
    for (const lot of this.plots) {
      if (!PLOT_SLOTS[lot.id]?.harbour || lot.phase !== 'empty') continue
      const from = this.plots.find((p) => !PLOT_SLOTS[p.id]?.harbour && p.phase === 'demolishing' && p.building.harbour)
      if (!from) return
      lot.phase = 'demolishing'
      lot.worked = from.worked
      lot.loadBuilding(from.building, from.removed.slice())
      for (const r of from.rubble) lot.spawnRubble(r.color, 0)
      // The old plot is free again; its crew drops what they were doing.
      for (const w of this.workers) if (w.plot === from.id) this.releaseTarget(w)
      for (const w of this.workers) if (w.plot === from.id && !w.carrying) w.state = 'idle'
      from.phase = 'empty'
      from.rubble = []
      from.clearBricks()
      this.markDirty()
    }
  }

  // ── Crew split ────────────────────────────────────────────────────────

  // How many workers each plot should have. Only plots that are being
  // demolished get anyone; by default the crew splits evenly, or follows
  // the player's manual plan (topped up / trimmed so it always adds up).
  desiredCrew(): number[] {
    const out = this.plots.map(() => 0)
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const total = this.workers.length
    if (!active.length) return out
    if (!this.crewPlan) {
      // Auto: split by work left (bricks still standing, tougher ones
      // counting more, plus rubble), at least one each.
      const work = active.map((id) => {
        const p = this.plots[id]
        return p.bricksLeft * (p.building.toughness ?? 1) + p.rubble.length + 1
      })
      const sum = work.reduce((a, b) => a + b, 0)
      let given = 0
      active.forEach((id, n) => {
        out[id] = Math.min(total, Math.max(total >= active.length ? 1 : 0, Math.floor((work[n] / sum) * total)))
        given += out[id]
      })
      // Hand out what rounding left over to the plots with the most work.
      const order = active.map((id, n) => ({ id, w: work[n] })).sort((a, b) => b.w - a.w)
      for (let k = 0; given < total; k++, given++) out[order[k % order.length].id]++
      for (let k = order.length - 1; given > total; k = (k + order.length - 1) % order.length) {
        if (out[order[k].id] > 1) {
          out[order[k].id]--
          given--
        }
      }
      return out
    }
    for (const id of active) out[id] = this.crewPlan[id] ?? 0
    let sum = active.reduce((n, id) => n + out[id], 0)
    while (sum < total) {
      const id = active.reduce((a, b) => (out[b] < out[a] ? b : a))
      out[id]++
      sum++
    }
    while (sum > total) {
      const id = active.reduce((a, b) => (out[b] > out[a] ? b : a))
      out[id]--
      sum--
    }
    return out
  }

  // +1 pulls a worker from the busiest other plot; -1 sends one to the
  // quietest other plot. Needs at least two plots being demolished.
  adjustCrew(plot: number, delta: 1 | -1) {
    const plan = this.desiredCrew()
    const others = this.plots.filter((p) => p.phase === 'demolishing' && p.id !== plot).map((p) => p.id)
    if (!others.length || this.plots[plot]?.phase !== 'demolishing') return
    if (delta > 0) {
      const from = others.reduce((a, b) => (plan[b] > plan[a] ? b : a))
      if (plan[from] === 0) return
      plan[from]--
      plan[plot]++
    } else {
      if (plan[plot] === 0) return
      const to = others.reduce((a, b) => (plan[b] < plan[a] ? b : a))
      plan[plot]--
      plan[to]++
    }
    this.crewPlan = plan
    this.markDirty()
  }

  // The crew screen's slider: put exactly `n` workers on a plot, taking
  // them from (or giving them to) the other plots, biggest first.
  setCrew(plot: number, n: number) {
    const plan = this.desiredCrew()
    const others = this.plots.filter((p) => p.phase === 'demolishing' && p.id !== plot).map((p) => p.id)
    if (this.plots[plot]?.phase !== 'demolishing') return
    const total = this.workers.length
    n = Math.max(0, Math.min(total, Math.round(n)))
    if (!others.length) return
    let diff = n - plan[plot]
    while (diff > 0) {
      const from = others.reduce((a, b) => (plan[b] > plan[a] ? b : a))
      if (plan[from] === 0) break
      plan[from]--
      plan[plot]++
      diff--
    }
    while (diff < 0) {
      const to = others.reduce((a, b) => (plan[b] < plan[a] ? b : a))
      plan[to]++
      plan[plot]--
      diff++
    }
    this.crewPlan = plan
    this.markDirty()
  }

  // Even split across the plots being demolished (a manual plan, so it
  // stays even rather than following work left).
  setCrewEven() {
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const total = this.workers.length
    const plan = this.plots.map(() => 0)
    active.forEach((id, n) => (plan[id] = Math.floor(total / active.length) + (n < total % active.length ? 1 : 0)))
    this.crewPlan = plan
    this.markDirty()
  }

  // Which quick choice the current split matches (for the crew sheet).
  crewMode(): 'work' | 'even' | 'custom' {
    if (!this.crewPlan) return 'work'
    const active = this.plots.filter((p) => p.phase === 'demolishing').map((p) => p.id)
    const want = this.desiredCrew()
    const vals = active.map((id) => want[id])
    return Math.max(...vals) - Math.min(...vals) <= 1 ? 'even' : 'custom'
  }

  setCrewAuto() {
    this.crewPlan = null
    this.markDirty()
  }

  // Moves idle workers from over-staffed plots to under-staffed ones. Busy
  // workers finish what they're doing first (carriers drop their brick).
  private rebalanceCrew() {
    if (this.plots.length < 2) return
    const want = this.desiredCrew()
    if (want.every((n) => n === 0)) return
    const have = this.plots.map(() => 0)
    for (const w of this.workers) have[w.plot]++
    for (const w of this.workers) {
      if (have[w.plot] <= want[w.plot] || w.carrying || w.state === 'picking') continue
      const to = want.findIndex((n, id) => have[id] < n)
      if (to < 0) break
      this.releaseTarget(w)
      have[w.plot]--
      have[to]++
      Object.assign(w, this.newWorker(w.id, to))
    }
  }

  private releaseTarget(w: Worker) {
    const site = this.plots[w.plot]
    const t = w.target
    if (t?.kind === 'brick') site.claimed[t.index] = 0
    else if (t?.kind === 'rubble') {
      const r = site.rubble.find((r) => r.id === t.id)
      if (r) r.claimed = false
    }
    w.target = null
  }

  claimBonus(amount: number) {
    this.scrap += amount
    this.markDirty()
  }

  dismissOffline() {
    this.offlineEarnings = 0
    this.markDirty()
  }

  // ── Rewarded-ad perks ─────────────────────────────────────────────────

  // Watched an ad on the "while you were away" banner: the same again.
  doubleOffline() {
    this.scrap += this.offlineEarnings
    this.offlineEarnings = 0
    this.save()
    this.markDirty()
  }

  // Watched an ad for 2× crew: minutes of boost on top of what's running.
  adBoost() {
    this.boostUntil = Math.max(this.boostUntil, this.time) + AD_BOOST_MINUTES * 60
    this.markDirty()
  }

  // Every plot's dumpsters, paid out as if a truck had hauled them in.
  private dumpsterValue() {
    let value = 0
    for (const site of this.plots) {
      const load = site.dumpsterLoad
      if (!load) continue
      const y = Math.max(0, ISLANDS.findIndex((s) => s.id === PLOT_SLOTS[site.id]?.island))
      value += load * site.building.brickValue * (1 + stats.priceBonus(this.yardU(y))) * eventMultiplier('double_bricks') * PACE.pay
    }
    return value
  }

  emptyDumpstersByAd(): boolean {
    if (Date.now() < this.adCooldowns.dumpsters) return false
    let bricks = 0
    let value = 0
    for (const site of this.plots) {
      const load = site.dumpsterLoad
      if (!load) continue
      const y = Math.max(0, ISLANDS.findIndex((s) => s.id === PLOT_SLOTS[site.id]?.island))
      value += load * site.building.brickValue * (1 + stats.priceBonus(this.yardU(y)))
      bricks += load
      for (const d of site.dumpsters) d.load = 0
    }
    if (!bricks) return false
    this.pay(bricks, value)
    for (const site of this.plots) this.checkCleared(site)
    this.adCooldowns.dumpsters = Date.now() + DUMPSTER_AD_COOLDOWN_MINUTES * 60_000
    this.save()
    return true
  }

  // One upgrade on the house (not yard expansions, which are built).
  freeUpgrade(key: UpgradeKey, yard = 0): boolean {
    if (key === 'yardSize' || Date.now() < this.adCooldowns.freeUpgrade) return false
    const u = isYardKey(key) ? this.yardU(yard) : this.upgrades
    const cost = upgradeCost(key, u[key])
    this.scrap += cost
    if (!this.buyUpgrade(key, yard)) {
      this.scrap -= cost
      return false
    }
    this.adCooldowns.freeUpgrade = Date.now() + FREE_UPGRADE_COOLDOWN_MINUTES * 60_000
    this.save()
    return true
  }

  // ── Simulation ────────────────────────────────────────────────────────

  // Bricks per second the whole fleet can haul, lapping every plot.
  private fleetRate(): number {
    const y = this.trucks[0]?.home ?? 0
    const stops = [yardGateOut(y), ...this.plots.map((p) => plotStop(p.id)), yardGateIn(y)]
    // Plus the drive through the yard: in, to the bay, and back out.
    let length = 20
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      length += routeLength(planRoute(from, stops[i + 1]), { x: from.x, z: from.line })
    }
    return this.trucks.reduce((rate, t) => {
      const lap = length / stats.truckSpeed(t.speed) + this.plots.length * LOAD_SECONDS + stats.unloadSeconds(this.yardU(t.home))
      return rate + stats.truckCargo(t.load) / lap
    }, 0)
  }

  private pay(bricks: number, value: number) {
    value *= eventMultiplier('double_bricks') * PACE.pay
    this.scrap += value
    this.count('haul', bricks)
    this.xp += bricks * eventMultiplier('double_xp')
    this.recentHauls.push({ t: this.time, value })
    this.markDirty()
  }

  private siteEmpty(site: Site) {
    return site.bricksLeft === 0 && site.rubble.length === 0 && !this.workers.some((w) => w.plot === site.id && w.carrying)
  }

  private checkCleared(site: Site) {
    if (site.phase === 'demolishing' && this.siteEmpty(site) && site.dumpsterLoad === 0 && !this.loadingAt(site)) {
      site.phase = 'cleared'
      this.count('clear')
      this.clearedById[site.building.id] = (this.clearedById[site.building.id] ?? 0) + 1
      this.logActivity({ kind: 'building_finished', building: site.building.id, name: site.building.name, seconds: Math.round(site.worked) })
      this.save()
      this.markDirty()
    }
  }

  // Sets where a worker is walking to, routed around the building.
  private walkTo(w: Worker, site: Site, x: number, z: number) {
    w.tx = x
    w.tz = z
    w.via = site.detour(w.x, w.z, x, z)
  }

  private moveToward(w: Worker, dt: number): boolean {
    let step = stats.walkSpeed(this.upgrades) * this.boostMul() * dt * (w.fast ? 2 : 1)
    // Corners first (walking round the building), then the spot itself.
    while (w.via.length) {
      const c = w.via[0]
      const d = Math.hypot(c.x - w.x, c.z - w.z)
      if (d > step) {
        w.x += ((c.x - w.x) / d) * step
        w.z += ((c.z - w.z) / d) * step
        w.heading = Math.atan2(c.x - w.x, c.z - w.z)
        return false
      }
      w.x = c.x
      w.z = c.z
      step -= d
      w.via.shift()
    }
    const dx = w.tx - w.x
    const dz = w.tz - w.z
    const dist = Math.hypot(dx, dz)
    if (dist <= step) {
      w.x = w.tx
      w.z = w.tz
      return true
    }
    w.x += (dx / dist) * step
    w.z += (dz / dist) * step
    w.heading = Math.atan2(dx, dz)
    return false
  }

  private assignTarget(w: Worker, site: Site) {
    let bestRubble: Rubble | null = null
    let bestDist = Infinity
    for (const r of site.rubble) {
      if (r.claimed || r.readyAt > this.time) continue
      const d = (r.x - w.x) ** 2 + (r.z - w.z) ** 2
      if (d < bestDist) {
        bestDist = d
        bestRubble = r
      }
    }
    if (bestRubble) {
      bestRubble.claimed = true
      w.target = { kind: 'rubble', id: bestRubble.id }
      this.walkTo(w, site, bestRubble.x, bestRubble.z)
      w.state = 'toPick'
      return
    }

    // This worker's place in the plot's crew sets its side of the building.
    let slot = 0
    let crew = 0
    for (const o of this.workers) {
      if (o.plot !== site.id) continue
      crew++
      if (o.id < w.id) slot++
    }
    const home = site.homeSpot(slot, crew)
    // Skip bricks whose standing spot someone else already has, so the
    // crew doesn't pile up on one spot.
    const taken = this.workers
      .filter((o) => o !== w && o.plot === site.id && (o.state === 'toPick' || o.state === 'picking') && o.target?.kind === 'brick')
      .map((o) => ({ x: o.tx, z: o.tz }))
    const skipped: number[] = []
    let i = -1
    let spot = { x: 0, z: 0 }
    for (let tries = 0; tries < 8; tries++) {
      i = site.pickTopBrick(home)
      if (i < 0) break
      spot = site.standSpot(i)
      if (!taken.some((t) => (t.x - spot.x) ** 2 + (t.z - spot.z) ** 2 < 0.35 * 0.35)) break
      site.claimed[i] = 1
      skipped.push(i)
      if (tries === 7) i = skipped.shift() ?? -1 // everywhere's busy: share a spot
    }
    for (const k of skipped) site.claimed[k] = 0
    if (i >= 0) {
      site.claimed[i] = 1
      w.target = { kind: 'brick', index: i }
      this.walkTo(w, site, spot.x, spot.z)
      w.state = 'toPick'
    }
  }

  // Which dumpster to take bricks to: the shortest line among those with
  // room, or null if they're all full or backed up (then wait aside).
  private chooseDumpster(w: Worker, site: Site): number | null {
    const walking = site.dumpsters.map(() => 0)
    for (const o of this.workers) if (o.plot === site.id && o.state === 'toDumpster' && o !== w) walking[o.dumpster]++
    let best: number | null = null
    let bestScore = Infinity
    site.dumpsters.forEach((d, i) => {
      const room = stats.dumpsterCapacity(d.level) - d.load
      const line = d.queue.length + walking[i]
      if (room <= 0 || line >= MAX_LINE) return
      const score = line * 1000 - room
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    })
    return best
  }

  private headForDumpster(w: Worker, site: Site) {
    const d = this.chooseDumpster(w, site)
    if (d === null) {
      // Everything's full: wait off to the side with the bricks.
      w.state = 'holding'
      const holders = this.workers.filter((o) => o.plot === site.id && o.state === 'holding' && o !== w).length
      w.dumpster = Math.min(w.dumpster, site.dumpsters.length - 1)
      const spot = site.holdSpot(w.dumpster, holders)
      this.walkTo(w, site, spot.x, spot.z)
      return
    }
    w.state = 'toDumpster'
    w.dumpster = d
    const tail = site.queueSpot(d, site.dumpsters[d].queue.length)
    this.walkTo(w, site, tail.x, tail.z)
  }

  tick(dt: number) {
    dt = Math.min(dt, 0.1)
    this.time += dt
    const u = this.upgrades
    if (this.yardBuild) this.checkYardBuild()
    if (this.landBuild) this.checkLandBuild()
    this.runAutomation()
    this.checkLevelRewards()
    this.tickHiccups(dt)
    this.tickYards(dt)
    this.runPendingKnocks()
    if (this.helpersUntil) this.syncHelpers()
    this.tickGoals()
    for (const site of this.plots) if (site.phase === 'demolishing') site.worked += dt

    this.rebalanceCrew()

    for (const w of this.workers) {
      const site = this.plots[w.plot]
      if (w.onBreak) continue
      switch (w.state) {
        case 'idle':
          if (site.phase === 'demolishing') this.assignTarget(w, site)
          break
        case 'toPick':
          if (this.moveToward(w, dt)) {
            w.state = 'picking'
            const t = w.target
            // Bricks still in the building can be tougher (big late
            // buildings); rubble on the ground is always quick.
            w.timer = (stats.pullSeconds(u) * (t?.kind === 'brick' ? (site.building.toughness ?? 1) : 1)) / this.boostMul() / (w.fast ? 2 : 1)
            if (t?.kind === 'brick') {
              const b = site.bricks[t.index]
              w.heading = Math.atan2(b.x * BRICK - w.x, b.z * BRICK - w.z)
            }
          }
          break
        case 'picking':
          w.timer -= dt
          if (w.timer <= 0) {
            const t = w.target
            if (t?.kind === 'brick') {
              w.carrying = site.bricks[t.index].color
              w.held++
              site.removeBrick(t.index)
              site.events.push({ type: 'brickPulled', index: t.index, workerId: w.id })
              this.markDirty()
            } else if (t?.kind === 'rubble') {
              const idx = site.rubble.findIndex((r) => r.id === t.id)
              if (idx >= 0) {
                w.carrying = site.rubble[idx].color
                w.held++
                site.rubble.splice(idx, 1)
                site.events.push({ type: 'rubblePicked', id: t.id })
              }
            }
            w.target = null
            // Room for more? Grab the next brick before the walk back.
            if (w.held > 0 && w.held < stats.carry(u)) {
              this.assignTarget(w, site)
              if ((w.state as WorkerState) === 'toPick') break
            }
            if (w.carrying) {
              this.headForDumpster(w, site)
            } else {
              w.state = 'idle'
            }
          }
          break
        case 'toDumpster': {
          // Head for the back of the line (it may have moved since setting
          // off) and join it on arrival.
          const dumpster = site.dumpsters[w.dumpster] ?? site.dumpsters[(w.dumpster = 0)]
          // Filled up (or backed up) on the way: pick again.
          if (dumpster.load >= stats.dumpsterCapacity(dumpster.level) || dumpster.queue.length >= MAX_LINE) {
            this.headForDumpster(w, site)
            break
          }
          const tail = site.queueSpot(w.dumpster, dumpster.queue.length)
          w.tx = tail.x
          w.tz = tail.z
          if (this.moveToward(w, dt)) {
            dumpster.queue.push(w.id)
            w.state = 'waiting'
          }
          break
        }
        case 'holding': {
          // Waiting aside; join a line as soon as a dumpster has room.
          this.moveToward(w, dt)
          if (this.chooseDumpster(w, site) !== null) this.headForDumpster(w, site)
          break
        }
        case 'waiting': {
          const dumpster = site.dumpsters[w.dumpster]
          const place = dumpster.queue.indexOf(w.id)
          const spot = site.queueSpot(w.dumpster, Math.max(0, place))
          w.tx = spot.x
          w.tz = spot.z
          // Shuffle up as the line moves, then face the front of the line.
          if (!this.moveToward(w, dt)) break
          const dir = DUMPSTER_SLOTS[w.dumpster].dir
          w.heading = Math.atan2(-dir.x, -dir.z)
          const capacity = stats.dumpsterCapacity(dumpster.level)
          // Full: everyone behind the front of the line steps aside to wait.
          if (place > 0 && dumpster.load >= capacity) {
            dumpster.queue.splice(place, 1)
            this.headForDumpster(w, site)
            break
          }
          if (place === 0 && dumpster.load < capacity && !this.loadingAt(site)) {
            const n = Math.min(w.held, capacity - dumpster.load)
            dumpster.load += n
            w.held -= n
            if (w.held === 0) {
              w.carrying = null
              w.state = 'idle'
              dumpster.queue.shift()
            }
            this.markDirty()
          }
          break
        }
      }
    }

    this.tickTrucks(dt)
    for (const site of this.plots) this.checkCleared(site)

    // Keep the boost pill's countdown ticking in the HUD.
    const boostSecond = Math.ceil(Math.max(0, this.boostUntil - this.time))
    if (boostSecond !== this.lastBoostSecond) {
      this.lastBoostSecond = boostSecond
      this.markDirty()
    }

    this.tickBonus(dt)
    this.recentHauls = this.recentHauls.filter((h) => this.time - h.t < 60)

    if (!this.replaying && this.dirty && this.time - this.lastFlush > 0.12) this.flush()
  }

  // ── Bonus drop ────────────────────────────────────────────────────────

  bonusDrop: { amount: number; droppedAt: number; expiresAt: number; chest: ChestType | null } | null = null
  lastBonusClaim: { at: number; amount: number } | null = null
  private trailerStart = -1
  private trailerDropped = false
  private nextBonusAt = nextBonusDelay()
  private lastBonusSecond = -1
  bonusHeld = false

  // -1 when no trailer is passing, otherwise 0→1 across the screen.
  trailerProgress(): number {
    return this.trailerStart < 0 ? -1 : Math.min(1, (this.time - this.trailerStart) / TRAILER_SECONDS)
  }

  private tickBonus(dt: number) {
    if (this.trailerStart < 0 && !this.bonusDrop && this.home.phase === 'demolishing' && this.time >= this.nextBonusAt) {
      this.startTrailer()
    }
    if (this.trailerStart >= 0) {
      const p = this.trailerProgress()
      if (!this.trailerDropped && p >= TRAILER_DROP_AT) {
        this.trailerDropped = true
        this.bonusDrop = {
          amount: Math.max(1, Math.round(stats.truckCargo(this.trucks[0]?.load ?? 0) * 2)),
          // Now and then it's a chest that fell off instead of bricks.
          chest: Math.random() < 0.3 ? (Math.random() < 0.8 ? 'wood' : 'iron') : null,
          droppedAt: this.time,
          expiresAt: this.time + BONUS_LIFETIME_SECONDS,
        }
        this.markDirty()
      }
      if (p >= 1) {
        this.trailerStart = -1
        this.nextBonusAt = this.time + nextBonusDelay()
      }
    }
    if (this.bonusDrop) {
      // The countdown holds while the claim card (and its ad) is open.
      if (this.bonusHeld) this.bonusDrop.expiresAt += dt
      if (this.time >= this.bonusDrop.expiresAt) {
        this.bonusDrop = null
        this.markDirty()
      } else {
        const second = Math.ceil(this.bonusDrop.expiresAt - this.time)
        if (second !== this.lastBonusSecond) {
          this.lastBonusSecond = second
          this.markDirty()
        }
      }
    }
  }

  // Also callable from the console in dev to test without waiting minutes.
  startTrailer() {
    this.trailerStart = this.time
    this.trailerDropped = false
  }

  // Freezes the countdown while the claim card (and its ad) is open.
  holdBonusDrop(held: boolean) {
    this.bonusHeld = held
  }

  // Ignored too long: a seagull made off with it.
  loseBonusDrop() {
    this.bonusDrop = null
    this.bonusHeld = false
    this.markDirty()
  }

  claimBonusDrop() {
    if (!this.bonusDrop) return
    if (this.bonusDrop.chest) this.chests[this.bonusDrop.chest]++
    else this.home.dumpsters[0].load += this.bonusDrop.amount
    this.lastBonusClaim = { at: this.time, amount: this.bonusDrop.amount }
    this.bonusDrop = null
    this.bonusHeld = false
    this.markDirty()
  }

  // ── Dumpsters (per plot) ──────────────────────────────────────────────

  buyDumpster(plot: number): boolean {
    const site = this.plots[plot]
    const cost = site ? dumpsterBuyCost(site.dumpsters.length) : null
    if (!site || cost === null || this.scrap < cost) return false
    this.scrap -= cost
    site.dumpsters.push({ level: 0, load: 0, queue: [] })
    this.markDirty()
    return true
  }

  upgradeDumpster(plot: number, index: number): boolean {
    const d = this.plots[plot]?.dumpsters[index]
    if (!d) return false
    const cost = dumpsterUpgradeCost(d.level)
    if (this.scrap < cost) return false
    this.scrap -= cost
    d.level++
    this.markDirty()
    return true
  }

  // ── Trucks ────────────────────────────────────────────────────────────

  buyTruckUpgrade(truckId: number, key: TruckUpgrade): boolean {
    const truck = this.trucks[truckId]
    if (!truck) return false
    const cost = truckUpgradeCost(key, truck[key])
    if (this.scrap < cost) return false
    this.scrap -= cost
    truck[key]++
    this.markDirty()
    return true
  }

  private lastDeparture = -Infinity

  // The dock at yard `y` with the shortest line (trucks heading to or using it).
  private pickDock(truck: Truck, y: number): number {
    const n = stats.docks(this.yardU(y))
    let best = 0
    let bestLine = Infinity
    for (let k = 0; k < n; k++) {
      const line = this.trucks.filter((t) => t !== truck && t.dest.kind === 'yard' && t.yard === y && t.dock === k).length
      if (line < bestLine) {
        best = k
        bestLine = line
      }
    }
    return best
  }

  // Builds the route: out of the yard it's in by the OUT gate (unless it's
  // staying in that yard), along the roads and over bridges, and in by the
  // IN gate of the yard it's going to — to a dock, or on to a parking bay
  // (or the kerb, if its home yard is full).
  private driveTo(truck: Truck, dest: Truck['dest']) {
    const path: Point[] = []
    const target = dest.kind === 'yard' ? this.unloadYard(truck) : dest.kind === 'park' ? truck.home : -1
    let from: RoadSpot | null = truck.inYard ? null : truck.at
    const kerb = this.kerbIndex(truck)
    const rank = this.parkRank(truck)
    if (truck.inYard) {
      const cur = truck.yard
      // Back-row bays reach the bay line by the side lane first.
      const out = truck.inYard === 'parked' ? unparkPath(cur, rank) : []
      const staysIn = target === cur && (dest.kind === 'yard' || (dest.kind === 'park' && kerb === null))
      if (!staysIn) {
        path.push(...out, ...yardExitPath(cur, out.length ? out[out.length - 1] : { x: truck.x, z: truck.z }))
        from = yardGateOut(cur)
      } else if (dest.kind === 'park') {
        if (truck.inYard === 'bay') path.push(...parkPath(cur, rank))
      } else {
        truck.dock = this.pickDock(truck, cur)
        path.push(...out, dockPoint(cur, truck.dock))
      }
    }
    if (from) {
      if (dest.kind === 'plot') path.push(...planRoute(from, plotStop(dest.plot)))
      else if (dest.kind === 'park' && kerb !== null) {
        const spot = kerbSpot(truck.home, kerb)
        path.push(...planRoute(from, spot), ...kerbPath(spot))
      } else {
        if (dest.kind === 'yard') truck.dock = this.pickDock(truck, target)
        path.push(...planRoute(from, yardGateIn(target)), ...yardEnterPath(target, dest.kind === 'yard' ? truck.dock : 0))
        if (dest.kind === 'park') path.push(...parkPath(target, rank))
      }
    }
    if (target >= 0) truck.yard = target
    truck.path = path
    truck.dest = dest
    truck.state = 'driving'
  }

  // Where to next: unload if full; else the next plot this lap with
  // anything in its dumpster; else unload whatever's aboard to end the
  // lap; else park at the yard until there's something to collect.
  private nextStop(truck: Truck) {
    if (truck.cargo >= stats.truckCargo(truck.load)) return this.driveTo(truck, { kind: 'yard' })
    for (let i = truck.lap; i < this.plots.length; i++) {
      if (this.plots[i].dumpsterLoad > 0) {
        truck.lap = i + 1
        return this.driveTo(truck, { kind: 'plot', plot: i })
      }
    }
    truck.lap = this.plots.length
    if (truck.cargo > 0) return this.driveTo(truck, { kind: 'yard' })
    truck.lap = 0
    this.driveTo(truck, { kind: 'park' })
  }

  private tickTrucks(dt: number) {
    for (const truck of this.trucks) {
      if (truck.broken) continue // broken down at the roadside
      switch (truck.state) {
        case 'parked':
          // Leave one at a time so the fleet drives in a line.
          if (this.time - this.lastDeparture > 2.2 && this.plots.some((p) => p.dumpsterLoad > 0)) {
            this.lastDeparture = this.time
            truck.lap = 0
            this.nextStop(truck)
          }
          break
        case 'driving':
          this.driveTruck(truck, dt)
          break
        case 'loading':
          truck.timer -= dt
          if (truck.timer <= 0 && truck.dest.kind === 'plot') {
            const site = this.plots[truck.dest.plot]
            // Empty the fullest dumpsters first.
            let room = stats.truckCargo(truck.load) - truck.cargo
            let n = 0
            for (const d of [...site.dumpsters].sort((a, b) => b.load - a.load)) {
              const take = Math.min(room, d.load)
              d.load -= take
              room -= take
              n += take
            }
            truck.cargo += n
            truck.cargoValue += n * site.building.brickValue
            this.markDirty()
            this.nextStop(truck)
          }
          break
        case 'unloading':
          truck.timer -= dt
          if (truck.timer <= 0) {
            // Tipped onto the yard's pile — paid when it ships.
            const ops = this.yardOps[truck.yard]
            ops.pile += truck.cargo
            ops.pileValue += truck.cargoValue * (1 + stats.priceBonus(this.yardU(truck.yard))) * (MGR.pay[truck.yard] ?? 1)
            truck.cargo = 0
            truck.cargoValue = 0
            if (truck.lap >= this.plots.length) truck.lap = 0
            this.nextStop(truck)
          }
          break
      }
    }
  }

  private driveTruck(truck: Truck, dt: number) {
    // Queue behind a truck just ahead in the same lane.
    const fx = Math.sin(truck.heading)
    const fz = Math.cos(truck.heading)
    // Wait behind a truck just ahead going the same way. Parked trucks
    // are off the road and oncoming or crossing ones pass by. If trucks
    // still end up waiting on each other (turning at a crossroads), any
    // truck held up for a few seconds squeezes past, so traffic can never
    // lock up for good.
    let blocked = false
    if (truck.squeeze <= 0) {
      for (const other of this.trucks) {
        if (other === truck || other.state === 'parked') continue
        if (Math.sin(other.heading) * fx + Math.cos(other.heading) * fz < 0.7) continue
        const dx = other.x - truck.x
        const dz = other.z - truck.z
        const ahead = dx * fx + dz * fz
        const side = Math.abs(dx * fz - dz * fx)
        if (ahead > 0 && ahead < 2.6 && side < 0.4) {
          blocked = true
          break
        }
      }
    } else truck.squeeze -= dt
    if (blocked) {
      truck.stuck += dt
      if (truck.stuck < 2.5) return
      truck.stuck = 0
      truck.squeeze = 1.5
    } else if (truck.squeeze <= 0) truck.stuck = 0

    let step = stats.truckSpeed(truck.speed) * dt
    while (step > 0 && truck.path.length) {
      const p = truck.path[0]
      const dx = p.x - truck.x
      const dz = p.z - truck.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.001) truck.heading = Math.atan2(dx, dz)
      if (dist <= step) {
        truck.x = p.x
        truck.z = p.z
        truck.path.shift()
        step -= dist
      } else {
        truck.x += (dx / dist) * step
        truck.z += (dz / dist) * step
        step = 0
      }
    }
    if (truck.path.length) return

    if (truck.dest.kind === 'plot') {
      truck.at = plotStop(truck.dest.plot)
      truck.inYard = null
      truck.state = 'loading'
      truck.timer = LOAD_SECONDS
    } else if (truck.dest.kind === 'yard') {
      truck.inYard = 'bay'
      truck.state = 'unloading'
      truck.timer = stats.unloadSeconds(this.yardU(truck.yard))
    } else {
      const kerb = this.kerbIndex(truck)
      if (kerb === null) truck.inYard = 'parked'
      else {
        truck.inYard = null
        truck.at = kerbSpot(truck.home, kerb)
      }
      truck.state = 'parked'
    }
    this.markDirty()
  }

  // ── Subscription (HUD) ────────────────────────────────────────────────

  markDirty() {
    this.dirty = true
  }

  private flush() {
    this.dirty = false
    this.lastFlush = this.time
    this.snapshot = null
    for (const l of this.listeners) l()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  // Force a HUD refresh for changes made outside tick() (purchases, picks).
  notify() {
    this.flush()
  }

  getSnapshot = (): Snapshot => {
    if (!this.snapshot) {
      const span = Math.max(10, Math.min(60, this.time))
      const earned = this.recentHauls.reduce((n, h) => n + h.value, 0)
      const crew = this.plots.map(() => 0)
      for (const w of this.workers) crew[w.plot]++
      const crewTarget = this.desiredCrew()
      this.snapshot = {
        scrap: this.scrap,
        xp: this.xp,
        level: levelForXp(this.xp),
        upgrades: this.upgrades,
        plots: this.plots.map((p) => ({
          id: p.id,
          phase: p.phase,
          buildingId: p.building.id,
          bricksTotal: p.bricks.length,
          bricksLeft: p.bricksLeft,
          rubbleLeft: p.rubble.length,
          dumpsterLoad: p.dumpsterLoad,
          dumpsters: p.dumpsters.map((d) => ({ level: d.level, load: d.load, capacity: stats.dumpsterCapacity(d.level) })),
          truckState: this.truckAt(p)?.state ?? 'away',
          crew: crew[p.id],
          crewTarget: crewTarget[p.id],
        })),
        trucks: this.trucks.map((t) => ({ id: t.id, load: t.load, speed: t.speed, cargo: t.cargo, state: t.state })),
        crewAuto: this.crewPlan === null,
        crewMode: this.crewMode(),
        incomePerMinute: Math.round((earned / span) * 60),
        offlineEarnings: this.offlineEarnings,
        sitesCleared: this.sitesCleared,
        boostLeft: Math.max(0, Math.ceil(this.boostUntil - this.time)),
        notice: this.notices[0] ?? null,
        catchUp: this.catchUpLeft > 0 && this.catchUpTotal > 0 ? 1 - this.catchUpLeft / this.catchUpTotal : null,
        shortId: this.shortId,
        username: this.username,
        synced: this.synced,
        ban: this.ban,
        islands: ISLANDS.map((s) => ({ id: s.id, open: this.islandOpen(s.id), stage: this.grown[s.id], yard: this.yardLevels[s.index] })),
        yardOps: this.yardOps.map((o, i) => ({ pile: Math.round(o.pile), shipLoad: Math.round(o.ship.load), shipCap: stats.shipCapacity(this.yardU(i)), shipAway: Math.ceil(o.ship.away), forklifts: o.forks.length })),
        truckCapacity: this.truckCapacity(),
        freeUpgradeIn: Math.max(0, Math.ceil((this.adCooldowns.freeUpgrade - Date.now()) / 1000)),
        dumpsterAdIn: Math.max(0, Math.ceil((this.adCooldowns.dumpsters - Date.now()) / 1000)),
        dumpsterValue: Math.round(this.dumpsterValue()),
        tools: {
          ballIn: Math.max(0, Math.ceil((this.toolReady.ball - Date.now()) / 1000)),
          dynamiteIn: Math.max(0, Math.ceil((this.toolReady.dynamite - Date.now()) / 1000)),
          ballCharges: this.toolCharges.ball,
          dynamiteCharges: this.toolCharges.dynamite,
          ballPack: this.toolPackPrice('ball'),
          dynamitePack: this.toolPackPrice('dynamite'),
        },
        toolFx: this.toolFx,
        needs: {
          brokenTruck: this.trucks.find((t) => t.broken)?.id ?? null,
          restingWorker: this.workers.find((w) => w.onBreak)?.id ?? null,
          jam: this.jamSince >= 0,
        },
        catchOffer: Math.max(0, Math.ceil((this.catchOfferUntil - Date.now()) / 1000)),
        helpersLeft: Math.max(0, Math.ceil((this.helpersUntil - Date.now()) / 1000)),
        goals: this.todaysGoals().map((g, i) => ({ text: g.text, progress: this.goalProgress(i), target: g.target, gems: g.gems, claimed: !!this.goalDay.claimed[i] })),
        goalsBonusReady: this.goalDay.claimed.every(Boolean) && !this.goalDay.bonus,
        goalsBonusClaimed: this.goalDay.bonus,
        contract: this.contract
          ? {
              name: BUILDINGS.find((b) => b.id === this.contract!.building)?.name ?? 'Building',
              progress: this.contractProgress(),
              target: this.contract.target,
              chest: this.contract.chest,
              gems: this.contract.gems,
            }
          : null,
        gems: this.gems,
        chests: { ...this.chests },
        freeChestIn: Math.max(0, Math.ceil((this.freeChestAt - Date.now()) / 1000)),
        adChestIn: Math.max(0, Math.ceil((this.adCooldowns.chest - Date.now()) / 1000)),
        ironChestPrice: chestBrickPrice(levelForXp(this.xp)),
        managers: Object.fromEntries(Object.entries(this.managers).map(([k, v]) => [k, { ...v }])),
        assigned: { ...this.assigned },
        abilities: Object.fromEntries(
          this.managerSlots().map((slot) => {
            const active = this.activeAbilities.find((a) => a.slot === slot)
            return [
              slot,
              {
                readyIn: Math.max(0, Math.ceil(((this.abilityReady[slot] ?? 0) - Date.now()) / 1000)),
                activeLeft: active ? Math.max(0, Math.ceil((active.until - Date.now()) / 1000)) : 0,
              },
            ]
          })
        ),
        outfit: this.outfit,
        outfits: [...this.outfits],
        landBuild: this.landBuild
          ? {
              island: this.landBuild.island,
              stage: this.landBuild.stage,
              secondsLeft: Math.max(0, Math.ceil((this.landBuild.endsAt - Date.now()) / 1000)),
              totalSeconds: Math.round((this.landBuild.endsAt - this.landBuild.startedAt) / 1000),
            }
          : null,
        yardBuild: this.yardBuild
          ? {
              yard: this.yardBuild.yard,
              toSize: this.yardBuild.level + 1,
              secondsLeft: Math.max(0, Math.ceil((this.yardBuild.endsAt - Date.now()) / 1000)),
              totalSeconds: yardBuildSeconds(this.yardBuild.level + 1),
            }
          : null,
        events: liveEvents.filter((e) => e.kind !== 'rain' && new Date(e.startsAt).getTime() <= Date.now() && new Date(e.endsAt).getTime() > Date.now()),
        raining: Date.now() < this.rainUntil || eventsLive('rain', Date.now()).length > 0,
        banners: this.banners,
        bonusDrop: this.bonusDrop
          ? { amount: this.bonusDrop.amount, secondsLeft: Math.ceil(this.bonusDrop.expiresAt - this.time), chest: this.bonusDrop.chest }
          : null,
      }
    }
    return this.snapshot
  }
}

// v4 saves had a single site; it becomes your home plot.
function migrateLegacy(old: LegacySave): SaveData {
  const u = old.upgrades
  return {
    scrap: old.scrap,
    xp: old.xp,
    upgrades: {
      tools: u.tools ?? u.hammer ?? 0,
      speed: u.speed ?? 0,
      workers: u.workers ?? 0,
      fleet: 0,
      yardSize: 0,
      yardDocks: 0,
      yardSpeed: 0,
      yardBonus: 0,
      forkSpeed: 0,
      forkPallet: 0,
      forkCount: 0,
      shipCap: 0,
      shipSpeed: 0,
    },
    trucks: [{ load: u.truck ?? 0, speed: 0 }],
    crewPlan: null,
    sitesCleared: old.sitesCleared ?? 0,
    lastSeen: old.lastSeen,
    plots: [
      {
        phase: old.phase === 'picking' ? 'empty' : 'demolishing',
        buildingId: old.buildingId,
        removed: old.removed,
        rubble: old.rubble,
        dumpsters: [{ level: u.dumpster ?? u.truck ?? 0, load: old.dumpsterLoad }],
      },
    ],
  }
}

let instance: Engine | null = null

export function getEngine(): Engine {
  if (!instance) {
    // Admin-made buildings from last time, so saves using them load even
    // before the game has checked the server.
    try {
      const cached = localStorage.getItem(CUSTOM_BUILDINGS_KEY)
      if (cached) registerCustomBuildings(JSON.parse(cached) as BuildingDef[])
    } catch {
      // none cached
    }
    instance = new Engine()
    instance.load()
    // Handy for poking at the simulation from the console during development.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __rubble: Engine }).__rubble = instance
  }
  return instance
}
