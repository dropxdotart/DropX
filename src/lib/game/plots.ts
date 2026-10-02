// The city is a grid of blocks with a road between every pair. Your plots
// sit on blocks scattered around the map; every other block is filler
// neighborhood. Coordinates are block centers in world units.

export const BLOCK = 23
export const MAP_BLOCKS = 2 // blocks drawn each way from home (a 5×5 city)

export type PlotSlot = {
  id: number
  x: number
  z: number
  cost: number
  requiredLevel: number
  harbour?: boolean // a big lot in the harbour district (for the biggest buildings)
}

// The harbour district: big lots on the quay off the east edge of the city,
// with open water around them so the biggest buildings have room.
export const HARBOUR_X = (MAP_BLOCKS + 1) * BLOCK

// Ordered by unlock. Diagonal neighbours first so new plots appear around
// the map (left/right/behind/in front of home on screen), not in a row.
export const PLOT_SLOTS: PlotSlot[] = [
  { id: 0, x: 0, z: 0, cost: 0, requiredLevel: 1 },
  { id: 1, x: BLOCK, z: -BLOCK, cost: 5_000, requiredLevel: 4 },
  { id: 2, x: -BLOCK, z: BLOCK, cost: 60_000, requiredLevel: 7 },
  { id: 3, x: -BLOCK, z: -BLOCK, cost: 500_000, requiredLevel: 10 },
  { id: 4, x: BLOCK, z: BLOCK, cost: 4_000_000, requiredLevel: 13 },
  { id: 5, x: (MAP_BLOCKS + 1) * BLOCK, z: 0, cost: 8_000_000, requiredLevel: 14, harbour: true },
  { id: 6, x: (MAP_BLOCKS + 1) * BLOCK, z: -BLOCK, cost: 30_000_000, requiredLevel: 16, harbour: true },
  { id: 7, x: (MAP_BLOCKS + 1) * BLOCK, z: BLOCK, cost: 100_000_000, requiredLevel: 18, harbour: true },
]

export function plotSlot(id: number): PlotSlot {
  return PLOT_SLOTS[id]
}

// The far edge of the map (behind everything, top-right on screen) is
// water. SHORE_Z is where the quay meets it.
export const SHORE_Z = -MAP_BLOCKS * BLOCK - BLOCK / 2 - 1.2

// The Brick Yard, where trucks unload and you get paid: on the waterfront
// at the edge of the city, so trucks make a real trip across town.
export const YARD_BLOCK = { x: 0, z: -MAP_BLOCKS * BLOCK }

// Blocks that aren't filler neighbourhood: plots and the yard.
export function isReservedBlock(x: number, z: number) {
  return PLOT_SLOTS.some((p) => p.x === x && p.z === z) || (x === YARD_BLOCK.x && z === YARD_BLOCK.z)
}
