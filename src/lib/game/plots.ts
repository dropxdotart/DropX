// Plots: the lots a player can own and demolish on. They're the 'plot' and
// 'harbour' blocks of the islands (see islands.ts), bought in this order —
// island by island, stage by stage — so a plot is only for sale once its
// bit of land has grown. The first is the home lot.

import { BLOCK, ISLANDS, type IslandId } from './islands'

export { BLOCK } from './islands'

export type PlotSlot = {
  id: number
  island: IslandId
  stage: number // the island stage that brings this plot's land
  x: number
  z: number
  cost: number
  requiredLevel: number
  harbour?: boolean // a big lot on the City's harbour quay (for the biggest buildings)
}

// Price and level of each plot, in buy order.
const PRICES: [cost: number, level: number][] = [
  // Houses island: 2 → 4 → 6
  [0, 1],
  [500, 2],
  [2_000, 3],
  [4_000, 4],
  [8_000, 6],
  [15_000, 7],
  // City: 2 → 4 → 6 → 8 (the last two on the harbour)
  [25_000, 8],
  [60_000, 9],
  [150_000, 10],
  [400_000, 11],
  [600_000, 12],
  [1_200_000, 13],
  [2_000_000, 14],
  [3_500_000, 15],
  // Industrial island: 2 → 4 → 6
  [3_000_000, 16],
  [6_000_000, 17],
  [10_000_000, 18],
  [15_000_000, 19],
  [22_000_000, 20],
  [32_000_000, 21],
]

export const PLOT_SLOTS: PlotSlot[] = ISLANDS.flatMap((s) =>
  s.cells
    .filter((c) => c.what === 'plot' || c.what === 'harbour')
    .sort((a, b) => a.stage - b.stage)
    .map((c) => ({ island: s.id, stage: c.stage, x: c.i * BLOCK, z: c.j * BLOCK, harbour: c.what === 'harbour' || undefined }))
).map((p, id) => ({ ...p, id, cost: PRICES[id]?.[0] ?? 1e9, requiredLevel: PRICES[id]?.[1] ?? 99 }))

export function plotSlot(id: number): PlotSlot {
  return PLOT_SLOTS[id]
}

export function islandIndex(id: IslandId): number {
  return ISLANDS.findIndex((s) => s.id === id)
}
