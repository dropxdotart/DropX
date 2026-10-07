// Plots: the lots a player can own and demolish on, spread over the islands
// (see islands.ts). Coordinates are block centres in world units.

import { BLOCK, HARBOUR_X, ISLANDS, type IslandId } from './islands'

export { BLOCK, HARBOUR_X } from './islands'

export type PlotSlot = {
  id: number
  island: IslandId
  x: number
  z: number
  cost: number
  requiredLevel: number
  harbour?: boolean // a big lot in the City's harbour (for the biggest buildings)
}

// Plots are bought in this order — by unlock level, so each island's plots
// come up as the player levels (a City or Industrial plot also needs that
// island's bridge built first). The first is the home lot.
export const PLOT_SLOTS: PlotSlot[] = [
  { id: 0, island: 'houses', x: 0, z: 5 * BLOCK, cost: 0, requiredLevel: 1 },
  { id: 1, island: 'houses', x: BLOCK, z: 6 * BLOCK, cost: 500, requiredLevel: 2 },
  { id: 2, island: 'houses', x: -BLOCK, z: 4 * BLOCK, cost: 2_000, requiredLevel: 3 },
  { id: 3, island: 'houses', x: -BLOCK, z: 6 * BLOCK, cost: 6_000, requiredLevel: 5 },
  { id: 4, island: 'city', x: 0, z: 0, cost: 25_000, requiredLevel: 8 },
  { id: 5, island: 'city', x: BLOCK, z: -BLOCK, cost: 60_000, requiredLevel: 9 },
  { id: 6, island: 'city', x: -BLOCK, z: BLOCK, cost: 150_000, requiredLevel: 10 },
  { id: 7, island: 'city', x: -BLOCK, z: -BLOCK, cost: 500_000, requiredLevel: 11 },
  { id: 8, island: 'city', x: BLOCK, z: BLOCK, cost: 2_000_000, requiredLevel: 13 },
  { id: 9, island: 'city', x: HARBOUR_X, z: 0, cost: 8_000_000, requiredLevel: 14, harbour: true },
  { id: 10, island: 'industrial', x: -4 * BLOCK, z: BLOCK, cost: 15_000_000, requiredLevel: 15 },
  { id: 11, island: 'city', x: HARBOUR_X, z: -BLOCK, cost: 30_000_000, requiredLevel: 16, harbour: true },
  { id: 12, island: 'industrial', x: -6 * BLOCK, z: -BLOCK, cost: 40_000_000, requiredLevel: 17 },
  { id: 13, island: 'city', x: HARBOUR_X, z: BLOCK, cost: 100_000_000, requiredLevel: 18, harbour: true },
  { id: 14, island: 'industrial', x: -5 * BLOCK, z: BLOCK, cost: 100_000_000, requiredLevel: 19 },
  { id: 15, island: 'industrial', x: -6 * BLOCK, z: BLOCK, cost: 250_000_000, requiredLevel: 21 },
]

export function plotSlot(id: number): PlotSlot {
  return PLOT_SLOTS[id]
}

export function islandIndex(id: IslandId): number {
  return ISLANDS.findIndex((s) => s.id === id)
}

// Blocks that aren't filler neighbourhood: plots and yards.
export function isReservedBlock(x: number, z: number) {
  return PLOT_SLOTS.some((p) => p.x === x && p.z === z) || ISLANDS.some((s) => s.yard.x === x && s.yard.z === z)
}
