import { ROAD_Z, TRUCK_STOP } from './layout'
import { BLOCK, MAP_BLOCKS, PLOT_SLOTS, YARD_BLOCK } from './plots'
import { LOT_HALF } from './layout'

// Truck routing on the city's road grid. Every road runs along a line just
// past a block's front (constant z) or right side (constant x). Vehicles
// keep right: heading +x uses the lane nearer the block (−0.6), heading −x
// the far one (+0.65); on cross streets +z is at −0.65 and −z at +0.65.

// Cross streets (constant x) run the whole map; streets along x (constant
// z) stop at the waterfront, so there's none past the last row of blocks.
export const ROAD_LINES: number[] = []
for (let k = -MAP_BLOCKS - 1; k <= MAP_BLOCKS; k++) ROAD_LINES.push(ROAD_Z + k * BLOCK)
export const ROAD_LINES_Z = ROAD_LINES.filter((z) => z > YARD_BLOCK.z - BLOCK / 2)

export type Point = { x: number; z: number }
// A spot on a front road: `line` is the road's z, `x` how far along.
export type RoadSpot = { x: number; line: number }

export function plotStop(plot: number): RoadSpot {
  const slot = PLOT_SLOTS[plot]
  return { x: slot.x + TRUCK_STOP.x, line: slot.z + ROAD_Z }
}

// The Brick Yard is fenced, with an IN gate and an OUT gate on its front
// (road) side. Trucks turn in at IN, drive to the unload bay, then loop
// across and leave by OUT — one way, so they never meet head-on. Trucks
// with nothing to do park in a row behind the bay. Points are world space.
const YARD_FRONT = YARD_BLOCK.z + LOT_HALF // the fence line facing the road
export const YARD_GATE_IN: RoadSpot = { x: YARD_BLOCK.x - 3, line: YARD_BLOCK.z + ROAD_Z }
export const YARD_GATE_OUT: RoadSpot = { x: YARD_BLOCK.x + 3, line: YARD_BLOCK.z + ROAD_Z }
export const YARD_BAY: Point = { x: YARD_BLOCK.x - 3, z: YARD_FRONT - 4.5 }

// From the IN gate on the road to the unload bay.
export function yardEnterPath(): Point[] {
  return [
    { x: YARD_GATE_IN.x, z: YARD_FRONT + 0.8 },
    { x: YARD_GATE_IN.x, z: YARD_FRONT - 1 },
    YARD_BAY,
  ]
}

// From the bay (or a parking bay) out through the OUT gate onto the road.
export function yardExitPath(from: Point): Point[] {
  return [
    { x: from.x, z: YARD_BAY.z },
    { x: YARD_GATE_OUT.x, z: YARD_BAY.z },
    { x: YARD_GATE_OUT.x, z: YARD_FRONT - 1 },
    { x: YARD_GATE_OUT.x, z: YARD_FRONT + 0.8 },
  ]
}

export function parkingSpot(truck: number): Point {
  return { x: YARD_BLOCK.x - 5 + (truck % 5) * 2.6, z: YARD_BAY.z - 4 - Math.floor(truck / 5) * 3 }
}

// From the bay into a parking bay.
export function parkPath(truck: number): Point[] {
  const spot = parkingSpot(truck)
  return [{ x: spot.x, z: YARD_BAY.z }, spot]
}

function laneOffset(from: Point, to: Point): Point {
  if (Math.abs(to.z - from.z) < 0.01) {
    const dz = to.x >= from.x ? -0.6 : 0.65
    return { x: 0, z: dz }
  }
  const dx = to.z >= from.z ? -0.65 : 0.65
  return { x: dx, z: 0 }
}

// Waypoints from one front-road spot to another, in driving lanes: along
// the current road to a cross street, along that, then along the target
// road. The cross street is the one that keeps the trip shortest.
export function planRoute(from: RoadSpot, to: RoadSpot): Point[] {
  const corners: Point[] = [{ x: from.x, z: from.line }]
  if (Math.abs(from.line - to.line) > 0.01) {
    let cross = ROAD_LINES[0]
    let best = Infinity
    for (const v of ROAD_LINES) {
      const cost = Math.abs(from.x - v) + Math.abs(v - to.x) + Math.abs(from.x - v) * 0.001
      if (cost < best) {
        best = cost
        cross = v
      }
    }
    corners.push({ x: cross, z: from.line }, { x: cross, z: to.line })
  }
  corners.push({ x: to.x, z: to.line })

  const out: Point[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]
    const b = corners[i + 1]
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) continue
    const o = laneOffset(a, b)
    out.push({ x: a.x + o.x, z: a.z + o.z }, { x: b.x + o.x, z: b.z + o.z })
  }
  if (!out.length) out.push({ x: to.x, z: to.line - 0.6 })
  return out
}

export function routeLength(points: Point[], start: Point): number {
  let len = 0
  let prev = start
  for (const p of points) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z)
    prev = p
  }
  return len
}
