import { ROAD_Z, TRUCK_STOP } from './layout'
import { BLOCK, MAP_BLOCKS, PLOT_SLOTS, YARD_BLOCK } from './plots'

// Truck routing on the city's road grid. Every road runs along a line just
// past a block's front (constant z) or right side (constant x). Vehicles
// keep right: heading +x uses the lane nearer the block (−0.6), heading −x
// the far one (+0.65); on cross streets +z is at −0.65 and −z at +0.65.

export const ROAD_LINES: number[] = []
for (let k = -MAP_BLOCKS - 1; k <= MAP_BLOCKS; k++) ROAD_LINES.push(ROAD_Z + k * BLOCK)

export type Point = { x: number; z: number }
// A spot on a front road: `line` is the road's z, `x` how far along.
export type RoadSpot = { x: number; line: number }

export function plotStop(plot: number): RoadSpot {
  const slot = PLOT_SLOTS[plot]
  return { x: slot.x + TRUCK_STOP.x, line: slot.z + ROAD_Z }
}

export const YARD_STOP: RoadSpot = { x: YARD_BLOCK.x + 2, line: YARD_BLOCK.z + ROAD_Z }

// Parking bays along the yard's front road for trucks with nothing to do.
export function parkingSpot(truck: number): RoadSpot {
  return { x: YARD_STOP.x - 3 - truck * 2.8, line: YARD_STOP.line }
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
