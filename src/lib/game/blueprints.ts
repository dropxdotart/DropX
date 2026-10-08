// Each building is a voxel function over a bounding box, reduced to its
// outer shell (any voxel with an empty neighbour) — interior fill is never
// visible, and dropping it keeps brick counts low enough to render every
// brick individually and take them out one at a time.
//
// Blueprint coordinates: z = 0 is the FRONT face and x = W - 1 is the right
// side — the two faces the isometric camera sees — so doors, signs and
// windows go there.

import { CITY_DESIGNS, HOUSE_DESIGNS, INDUSTRIAL_DESIGNS } from './designs'

export const BRICK_COLORS = {
  brick: '#c4553a',
  brickDark: '#9e3f2a',
  brickLight: '#d66e4f',
  glass: '#8ec9e8',
  glassDark: '#4f7fa3',
  trim: '#f4f1ea',
  roof: '#5a5f6b',
  roofDark: '#464a54',
  roofRed: '#b4482f',
  roofRedDark: '#8f3824',
  concrete: '#bdb9af',
  concreteDark: '#94908a',
  wood: '#c08550',
  woodDark: '#8a5a30',
  door: '#6b4423',
  steel: '#9aa5b1',
  steelDark: '#6f7b88',
  white: '#f2f0ea',
  hull: '#2d3e57',
  red: '#d64545',
  blue: '#3f6fb5',
  navy: '#24365a',
  panel: '#2f5f9e',
  yellow: '#f2c230',
  orange: '#ef7d2d',
  grass: '#6cb85a',
  black: '#2b2b2e',
  // Added later: keep new colours at the END (shapes store the index).
  patina: '#6fae98',
  patinaDark: '#4f8a76',
  gold: '#e3b33c',
  stone: '#d8c79a',
  // Interiors (2026-10-08).
  water: '#4fb7e6',
  tile: '#e9e4d6',
  green: '#3f9a4f',
  cream: '#efe3c2',
  purple: '#7a4f8f',
  pink: '#e98fa8',
  carpet: '#a8433f',
} as const

export type BrickColor = keyof typeof BRICK_COLORS

export type Brick = { x: number; y: number; z: number; color: BrickColor }

type Blueprint = {
  size: [number, number, number]
  voxel: (x: number, y: number, z: number) => BrickColor | null
}

const between = (v: number, a: number, b: number) => v >= a && v <= b

// A window opening of glass framed by a one-brick white trim border.
function framedWindow(u: number, v: number, u0: number, v0: number, w: number, h: number): BrickColor | null {
  if (!between(u, u0 - 1, u0 + w) || !between(v, v0 - 1, v0 + h)) return null
  if (between(u, u0, u0 + w - 1) && between(v, v0, v0 + h - 1)) return 'glass'
  return 'trim'
}

const BLUEPRINTS: Blueprint[] = [
  // 0 — Garden shed: plank walls, framed door and window, shingled gable
  // roof with eaves overhanging front and back.
  {
    size: [9, 11, 9],
    voxel: (x, y, z) => {
      if (y < 6) {
        if (!between(z, 1, 7)) return null
        if (z === 1) {
          if (between(x, 3, 5) && y <= 3) return y === 3 || x === 3 || x === 5 ? 'trim' : 'door'
        }
        if (x === 8) {
          const win = framedWindow(z, y, 3, 2, 3, 2)
          if (win) return win
        }
        return y % 2 === 0 ? 'wood' : 'woodDark'
      }
      const k = y - 6
      if (!between(z, k, 8 - k)) return null
      return k % 2 === 0 ? 'roofRed' : 'roofRedDark'
    },
  },
  // 1 — Old house: two floors of brick with corner quoins, framed windows,
  // a front door with steps, gable roof and a chimney.
  {
    size: [15, 17, 13],
    voxel: (x, y, z) => {
      if (x === 11 && between(z, 3, 4) && y >= 10) return y <= 16 ? (y === 16 ? 'concreteDark' : 'brickDark') : null
      if (y < 10) {
        if (!between(z, 1, 11)) {
          if (z === 0 && y === 0 && between(x, 6, 8)) return 'concrete'
          return null
        }
        if ((x === 0 || x === 14) && y % 2 === 0) return 'brickLight'
        if (z === 1) {
          if (between(x, 6, 8) && y <= 4) return y === 4 || x === 6 || x === 8 ? 'trim' : 'door'
          for (const wx of [2, 11]) {
            for (const wy of [2, 6]) {
              const win = framedWindow(x, y, wx, wy, 2, 2)
              if (win) return win
            }
          }
          const top = framedWindow(x, y, 6, 6, 3, 2)
          if (top) return top
        }
        if (x === 14) {
          for (const wz of [3, 8]) {
            for (const wy of [2, 6]) {
              const win = framedWindow(z, y, wz, wy, 2, 2)
              if (win) return win
            }
          }
        }
        if (y === 9) return 'trim'
        return (x + y) % 5 === 0 ? 'brickDark' : 'brick'
      }
      const k = y - 10
      if (!between(z, k, 12 - k)) return null
      return k % 2 === 0 ? 'roof' : 'roofDark'
    },
  },
  // 2 — Warehouse: concrete base, ribbed steel upper walls, two roller
  // doors, a high window strip, a yellow sign band and rooftop vents.
  {
    size: [24, 12, 15],
    voxel: (x, y, z) => {
      if (y === 11) return (between(x, 4, 6) || between(x, 16, 18)) && between(z, 5, 8) ? 'steelDark' : null
      if (y === 10) return 'roofDark'
      const front = z === 0
      if (front && (between(x, 3, 8) || between(x, 15, 20)) && y <= 5) {
        if (x === 3 || x === 8 || x === 15 || x === 20 || y === 5) return 'yellow'
        return y % 2 === 0 ? 'steel' : 'steelDark'
      }
      if (y === 7 && (front || x === 23) && (front ? x : z) % 3 === 1) return 'glass'
      if (front && y === 9 && between(x, 9, 14)) return 'yellow'
      if (y >= 7) return (front ? x : x === 23 ? z : x) % 2 === 0 ? 'steel' : 'steelDark'
      return y === 0 ? 'concreteDark' : 'concrete'
    },
  },
  // 3 — Office tower: dark-glass lobby, concrete floor bands and mullions,
  // a stepped steel crown and an antenna.
  {
    size: [12, 41, 12],
    voxel: (x, y, z) => {
      const cx = Math.abs(x - 5.5)
      const cz = Math.abs(z - 5.5)
      if (y >= 37) return cx < 1 && cz < 1 ? (y === 40 ? 'red' : 'steelDark') : null
      if (y >= 34) return cx <= 3.5 && cz <= 3.5 ? (y === 34 ? 'concrete' : 'steel') : null
      const corner = (x === 0 || x === 11) && (z === 0 || z === 11)
      if (y < 4) {
        if (corner || y === 3) return 'concreteDark'
        if (z === 0 && between(x, 4, 7) && y <= 2) return 'glassDark'
        return (z === 0 ? x : z) % 3 === 0 ? 'concrete' : 'glassDark'
      }
      if (y % 4 === 3 || corner) return 'concrete'
      return (x === 0 || x === 11 ? z : x) % 3 === 0 ? 'concreteDark' : 'glass'
    },
  },
  // 4 — Shopping mall (~45 min): two floors of storefronts with striped
  // awnings, a sign band, a glass atrium with a pyramid skylight, a tall
  // sign pylon, rooftop AC units and a painted plaza.
  {
    size: [34, 24, 26],
    voxel: (x, y, z) => {
      // Sign pylon at the front-left corner of the plaza.
      if (between(x, 1, 2) && z === 0) {
        if (y > 21) return null
        if (y === 21) return 'red'
        return y % 4 === 3 ? (y % 8 === 3 ? 'orange' : 'yellow') : 'navy'
      }
      if (y === 0) {
        if (z <= 1) return x % 4 === 0 ? 'white' : 'concreteDark'
        return between(x, 1, 32) && z <= 24 ? 'concreteDark' : null
      }
      // Awnings jut out over the shop windows.
      if (z === 1 && y === 5) return between(x, 2, 31) && !between(x, 14, 19) ? (x % 2 === 0 ? 'red' : 'white') : null
      if (z === 1 && y === 4 && between(x, 2, 31) && !between(x, 14, 19) && x % 2 === 0) return 'red'
      // Rooftop: AC units, then the atrium and its skylight.
      const atrium = between(x, 12, 21) && between(z, 8, 17)
      if (y >= 15) {
        if (y <= 16 && !atrium) {
          if ((between(x, 4, 7) && between(z, 18, 21)) || (between(x, 26, 29) && between(z, 5, 8)) || (between(x, 26, 29) && between(z, 17, 20)))
            return y === 16 ? 'steelDark' : (x + z) % 2 === 0 ? 'steel' : 'steelDark'
        }
        if (y === 15 && between(x, 1, 32) && between(z, 2, 24) && !atrium && (x === 1 || x === 32 || z === 2 || z === 24)) return 'trim'
        if (atrium) {
          if (y <= 19) {
            const edge = (x === 12 || x === 21) && (z === 8 || z === 17)
            return edge || y === 19 ? 'steelDark' : 'glass'
          }
          const k = y - 20
          if (between(x, 12 + k + 1, 21 - k - 1) && between(z, 8 + k + 1, 17 - k - 1)) return k % 2 === 0 ? 'glass' : 'glassDark'
          if (k === 0) return 'steel'
        }
        return null
      }
      if (!between(x, 1, 32) || !between(z, 2, 24)) return null
      if (y === 14) return 'roof'
      const front = z === 2
      const side = x === 32
      if (front) {
        if (between(x, 14, 19) && y <= 6) return x === 14 || x === 19 || y === 6 ? 'trim' : 'glassDark'
        if (y <= 4) return x % 5 === 1 ? 'white' : 'glass'
        if (y === 7 || y === 8) return between(x, 9, 24) ? (y === 7 ? 'blue' : 'navy') : 'white'
        if (between(y, 9, 12)) return x % 4 === 0 ? 'white' : y === 12 ? 'trim' : 'glass'
        return y === 13 ? 'trim' : 'white'
      }
      if (side) {
        if (y <= 4) return z % 5 === 0 ? 'white' : 'glass'
        if (y === 5) return z % 2 === 0 ? 'red' : 'white'
        if (between(y, 9, 12)) return z % 4 === 0 ? 'white' : 'glass'
        return y === 7 || y === 13 ? 'trim' : 'white'
      }
      if (y === 7 || y === 13) return 'trim'
      return (x + z + y) % 7 === 0 ? 'concrete' : 'white'
    },
  },
  // 5 — Stadium (~1.5 h): an elliptical bowl of tiered seats in team
  // colours with aisles, a striped pitch with goals, an outer facade with
  // entrances and window bands, a roof canopy, a scoreboard and four
  // floodlight masts.
  {
    size: [36, 27, 32],
    voxel: (x, y, z) => {
      // Floodlight masts on the four corners.
      for (const [px, pz] of [[0, 0], [35, 0], [0, 31], [35, 31]] as [number, number][]) {
        if (x === px && z === pz) return y <= 26 ? (y >= 23 ? 'yellow' : 'steelDark') : null
        if (y >= 23 && y <= 25 && Math.abs(x - px) + Math.abs(z - pz) === 1) return 'yellow'
      }
      const nx = (x - 17.5) / 17.5
      const nz = (z - 15.5) / 15.5
      const r = Math.sqrt(nx * nx + nz * nz)
      if (r > 1) return null
      const ang = Math.atan2(nz, nx)
      const sector = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 24)
      // Scoreboard over the north stand.
      if (between(x, 13, 22) && z === 30 && between(y, 21, 26)) return y === 21 || y === 26 || x === 13 || x === 22 ? 'yellow' : 'black'
      if (r < 0.5) {
        if (y > 2) return null
        // Goals at each end of the pitch.
        if (y >= 1) return Math.abs(nz) < 0.12 && Math.abs(Math.abs(nx) - 0.42) < 0.03 ? 'white' : null
        const line = Math.abs(nx) < 0.03 || Math.abs(r - 0.47) < 0.025 || (Math.abs(nx) < 0.1 && Math.abs(nz) < 0.1)
        return line ? 'white' : 'grass'
      }
      // Roof canopy over the upper seats.
      if (r > 0.84 && (y === 23 || y === 24)) return y === 23 ? 'white' : sector % 2 === 0 ? 'steel' : 'steelDark'
      if (r > 0.95) {
        if (y > 22) return null
        if (y <= 4) return sector % 3 === 0 ? (y === 4 ? 'trim' : 'glassDark') : 'concreteDark'
        if (y === 9 || y === 14) return sector % 2 === 0 ? 'glass' : 'concrete'
        if (y >= 21) return 'trim'
        return y % 2 === 0 ? 'concrete' : 'concreteDark'
      }
      const standTop = ((r - 0.5) / 0.45) * 22
      if (y > standTop) return null
      if (y >= Math.floor(standTop) - 1) {
        if (sector % 4 === 0) return 'white' // aisle steps
        const tier = Math.floor(y / 3) % 3
        return tier === 0 ? 'red' : tier === 1 ? 'blue' : 'navy'
      }
      return 'concrete'
    },
  },
  // 6 — Cruise ship (~3 h): a long tapered hull with red bottom paint,
  // porthole rows, ten stepped decks of recessed balconies, lifeboats
  // along both sides, a glass bridge, a pool deck, two funnels and a mast.
  {
    size: [36, 52, 30],
    voxel: (x, y, z) => {
      const mid = 14.5
      // Hull: narrows toward the keel and to a point at the bow.
      if (y <= 13) {
        const bow = x > 26 ? (x - 26) * 1.35 : 0
        const keel = y < 5 ? (5 - y) * 0.9 : 0
        const half = 13.5 - bow - keel - (x < 2 ? 1.2 : 0)
        if (Math.abs(z - mid) > half || half < 0.5) return null
        if (y <= 3) return 'red'
        if (y === 4) return 'black'
        if (y === 5) return 'navy'
        if ((y === 8 || y === 11) && x % 2 === 0 && Math.abs(Math.abs(z - mid) - half) < 1) return 'glassDark'
        if (y === 13) return 'trim'
        return 'white'
      }
      // Funnels and mast rise above the decks.
      for (const fx of [8, 16]) {
        if (between(x, fx, fx + 3) && between(z, 12, 17) && y <= 51) {
          if (y >= 49) return 'black'
          if (y === 46) return 'white'
          return 'red'
        }
      }
      if (x === 27 && between(z, 14, 15) && y <= 51) return y >= 50 ? 'red' : 'steel'
      const d = Math.floor((y - 14) / 3)
      if (d > 9) return null
      const x0 = 1 + Math.floor(d * 1.2)
      const x1 = 28 - Math.floor(d * 1.5)
      const zi = 2 + Math.floor(d / 3)
      const zo = 29 - zi
      // Lifeboats hang just outside deck 1.
      if (d === 1 && (z === zi - 1 || z === zo + 1) && between(y, 17, 18) && x % 6 < 4 && between(x, x0 + 2, x1 - 3))
        return y === 18 ? 'white' : 'orange'
      const v = (y - 14) % 3
      if (!between(x, x0, x1) || !between(z, zi, zo)) {
        // Railings along the open deck edges below (where this deck steps in).
        if (v === 0 && d >= 1 && (x + z) % 2 === 0) {
          const p0 = 1 + Math.floor((d - 1) * 1.2)
          const p1 = 28 - Math.floor((d - 1) * 1.5)
          const pi = 2 + Math.floor((d - 1) / 3)
          const onBelow = between(x, p0, p1) && between(z, pi, 29 - pi)
          const rim = x === p0 || x === p1 || z === pi || z === 29 - pi
          if (onBelow && rim) return 'white'
        }
        return null
      }
      // A glass-roofed promenade runs up through the middle of the lower decks.
      if (d <= 5 && between(x, 8, 20) && between(z, 11, 18)) {
        if (d === 5 && v === 2) return (x + z) % 3 === 0 ? 'steel' : 'glass'
        if (between(x, 9, 19) && between(z, 12, 17)) return d === 0 && v === 0 ? 'grass' : null
      }
      // Pool deck on the stern of deck 4.
      if (d === 4 && v === 0 && x < x0 + 6 && between(z, zi + 3, zo - 3)) return x === x0 || z === zi + 3 || z === zo - 3 ? 'white' : 'blue'
      const side = z === zi || z === zo
      const front = x === x1
      const stern = x === x0
      if (front && d >= 7) return v === 2 ? 'white' : 'glassDark' // bridge
      if (side || front || stern) {
        if (v === 0 || x % 3 === 0) return 'white' // deck edges and balcony dividers
        return null // the balcony itself: open, set back one brick
      }
      if (z === zi + 1 || z === zo - 1 || x === x1 - 1 || x === x0 + 1) return v === 1 ? 'glass' : v === 2 ? 'trim' : 'white'
      return v === 0 ? 'concrete' : 'white'
    },
  },
  // 7 — Space station (~6 h): a tall ribbed core on a launch pad, five
  // habitat rings on spokes, gridded solar wings at three levels, four
  // lattice towers, docking modules and a dish on a mast.
  {
    size: [36, 96, 32],
    voxel: (x, y, z) => {
      const dx = x - 17.5
      const dz = z - 15.5
      const r = Math.sqrt(dx * dx + dz * dz)
      // Launch pad with a hazard border.
      if (y === 0) {
        if (!between(x, 3, 32) || !between(z, 1, 30)) return null
        const edge = x === 3 || x === 32 || z === 1 || z === 30
        return edge ? ((x + z) % 2 === 0 ? 'yellow' : 'black') : 'concrete'
      }
      // Lattice towers at the corners of the pad.
      for (const [tx, tz] of [[4, 2], [30, 2], [4, 28], [30, 28]] as [number, number][]) {
        if (between(x, tx, tx + 1) && between(z, tz, tz + 1) && y <= 30) return y === 30 ? 'red' : y % 4 === 0 ? 'steel' : 'steelDark'
      }
      // Core.
      if (r <= 5.5 && y <= 84) {
        if (y % 6 === 0) return 'steelDark'
        const a = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 16)
        if (y % 6 === 3 && a % 2 === 0) return 'glass'
        return a % 4 === 0 ? 'steel' : 'white'
      }
      // Habitat rings, joined to the core by spokes.
      for (const ry of [12, 28, 44, 60, 76]) {
        const tube = Math.sqrt((r - 12.5) ** 2 + (y - ry) ** 2)
        if (tube <= 2.9 && r <= 17.4) {
          const a = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * 32)
          if (a % 8 === 0) return 'steelDark'
          return y === ry && r > 13.5 && a % 2 === 0 ? 'glass' : 'white'
        }
        if (Math.abs(y - ry) <= 1 && r < 10 && (Math.abs(dx) <= 0.6 || Math.abs(dz) <= 0.6)) return 'steel'
      }
      // Solar wings out to both sides.
      for (const wy of [20, 36, 52, 68]) {
        if (y === wy && Math.abs(dx) > 6 && between(z, 3, 28)) {
          if (Math.abs(dz) <= 0.6) return 'steelDark'
          if (Math.abs(dx) > 17) return null
          return Math.round(Math.abs(dx)) % 4 === 0 || z % 5 === 3 ? 'steelDark' : 'panel'
        }
      }
      // Docking modules sticking out front and back.
      for (const my of [4, 5, 6]) {
        if (y === my && Math.abs(dx) <= 1.5 && between(Math.abs(dz), 5, 15)) return Math.abs(dz) >= 14 ? 'red' : 'white'
      }
      // Mast and dish on top.
      if (y > 84) {
        if (r < 0.8) return y >= 94 ? 'red' : 'steelDark'
        const ring = (y - 85) * 1.3
        if (y <= 91 && r <= ring + 0.8 && r >= ring - 0.8) return 'white'
      }
      return null
    },
  },
  // The designs below are the ones these buildings had before they were
  // made bigger (2026-10-02). They're kept so a demolition already under
  // way in a save finishes with the building it started (see
  // LEGACY_BUILDINGS); nobody can start one anymore.
  // 8 — (old) Shopping mall: storefront glass with striped awnings, a blue sign
  // band, an upper floor of windows and a glass skylight.
  {
    size: [30, 13, 18],
    voxel: (x, y, z) => {
      if (y === 12) return between(x, 10, 19) && between(z, 6, 11) ? 'glass' : null
      if (y === 11) return 'roof'
      if (z === 0 && y === 4) return x % 2 === 0 ? 'red' : 'white'
      if (z === 0 && between(y, 1, 3)) return x % 6 === 0 ? 'white' : 'glass'
      if (z === 0 && between(y, 6, 7)) return between(x, 8, 21) ? (y === 6 ? 'blue' : 'navy') : 'white'
      if ((z === 0 || x === 29) && between(y, 8, 9)) return (z === 0 ? x : z) % 3 === 0 ? 'white' : 'glass'
      if (y === 0) return 'concreteDark'
      return 'white'
    },
  },
  // 9 — (old) Stadium: an elliptical bowl of tiered seats, a lined pitch, and
  // floodlight towers at the four corners.
  {
    size: [33, 14, 25],
    voxel: (x, y, z) => {
      const corners: [number, number][] = [[1, 1], [31, 1], [1, 23], [31, 23]]
      for (const [px, pz] of corners) {
        if (x === px && z === pz) return y <= 13 ? (y >= 12 ? 'yellow' : 'steelDark') : null
      }
      const nx = (x - 16) / 16.5
      const nz = (z - 12) / 12.5
      const r = Math.sqrt(nx * nx + nz * nz)
      if (r > 1) return null
      if (r < 0.55) {
        if (y !== 0) return null
        const line = x === 16 || Math.abs(r - 0.52) < 0.03 || (Math.abs(nx) < 0.08 && Math.abs(nz) < 0.08)
        return line ? 'white' : 'grass'
      }
      const standHeight = ((r - 0.55) / 0.45) * 10
      if (y > standHeight) return null
      if (y >= Math.floor(standHeight) - 1) return y % 4 < 2 ? 'red' : 'blue'
      return 'concrete'
    },
  },
  // 10 — (old) Cruise ship: tapered hull with a red waterline and portholes,
  // stepped white decks with window rows, a glass bridge and two funnels.
  {
    size: [36, 18, 12],
    voxel: (x, y, z) => {
      const bow = x > 27 ? x - 27 : 0
      const zMin = Math.ceil(bow / 1.6)
      const zMax = 11 - zMin
      if (!between(z, zMin, zMax)) return null
      if (y <= 1) return 'hull'
      if (y === 2) return 'red'
      if (y <= 5) return y === 4 && x % 3 === 0 && (z === zMin || z === zMax) ? 'glassDark' : y === 5 ? 'navy' : 'white'
      for (const fx of [10, 17]) {
        if (between(x, fx, fx + 2) && between(z, 4, 7)) return y <= 16 ? (y >= 15 ? 'black' : 'red') : null
      }
      const deck = Math.floor((y - 6) / 3)
      if (deck > 2) return null
      if (x < 3 + deck * 3 || x > 26 - deck * 2 || !between(z, 1, 10)) return null
      const edge = z === 1 || z === 10 || x === 26 - deck * 2
      if (edge && y % 3 === 1) return x === 26 - deck * 2 && deck === 2 ? 'glassDark' : 'glass'
      return 'white'
    },
  },
  // 11 — (old) Space station: a ribbed central core, two gridded solar wings, a
  // ring module and a dish on top.
  {
    size: [33, 20, 33],
    voxel: (x, y, z) => {
      const dx = x - 16
      const dz = z - 16
      const r = Math.sqrt(dx * dx + dz * dz)
      if (r <= 4.2 && y <= 14) return y % 3 === 0 ? 'steelDark' : 'white'
      if (between(y, 6, 8) && between(r, 8, 10.5)) return y === 7 ? 'glass' : 'steel'
      if (y === 7 && Math.abs(dz) <= 3 && Math.abs(dx) > 10.5) {
        return Math.abs(dx) % 4 === 0 || Math.abs(dz) === 3 ? 'steelDark' : 'panel'
      }
      if (y === 7 && Math.abs(dz) <= 1 && between(Math.abs(dx), 4, 8)) return 'steel'
      if (y >= 15 && r <= (y - 14) * 1.4 && r >= (y - 14) * 1.4 - 1.5) return 'white'
      if (y >= 15 && r < 0.8) return y === 19 ? 'red' : 'steelDark'
      return null
    },
  },
  // ── Industrial island (2026-10-02) ───────────────────────────────────
  // 12 — Factory: a long brick works with a sawtooth roof of glass north
  // lights, loading docks with roller doors, a tall brick chimney and a
  // water tower on the roof.
  {
    size: [34, 40, 28],
    voxel: (x, y, z) => {
      // Chimney at the back-right corner.
      if (Math.hypot(x - 29.5, z - 23.5) <= 1.8 && y <= 39) {
        if (Math.hypot(x - 29.5, z - 23.5) <= 0.7 && y > 2) return null
        return y >= 37 ? 'black' : y % 6 === 0 ? 'trim' : 'brickDark'
      }
      // Water tower on legs on the roof.
      if (y >= 16 && y <= 30) {
        const legs = [[5, 18], [9, 18], [5, 22], [9, 22]].some(([lx, lz]) => x === lx && z === lz) && y <= 23
        if (legs) return 'steelDark'
        if (y >= 24 && Math.hypot(x - 7, z - 20) <= 3.2) return y === 30 ? 'roofDark' : y % 2 ? 'wood' : 'woodDark'
      }
      if (y === 0) return between(x, 0, 33) && between(z, 0, 27) ? 'concreteDark' : null
      if (!between(x, 1, 32) || !between(z, 3, 26)) {
        // Loading docks out front.
        if (z <= 2 && y <= 2 && x % 7 >= 2 && x % 7 <= 5) return y === 2 ? 'yellow' : 'concrete'
        return null
      }
      const wallTop = 12
      if (y < wallTop) {
        const front = z === 3
        if (front && y <= 6 && x % 7 >= 2 && x % 7 <= 5) return y === 6 ? 'yellow' : y % 2 ? 'steel' : 'steelDark' // roller doors
        if ((front || x === 32) && y >= 8 && y <= 10 && (front ? x : z) % 3 !== 0) return 'glassDark'
        if (y === 7 || y === 11) return 'trim'
        return (x + y) % 6 === 0 ? 'brickLight' : y % 2 ? 'brick' : 'brickDark'
      }
      // Sawtooth roof: rows of steep glass faces toward the front.
      const k = (z - 3) % 6
      const h = wallTop + (5 - k)
      if (y > h) return null
      return k === 5 || y === h ? 'roofDark' : k === 0 ? 'glass' : 'roof'
    },
  },
  // 13 — Power plant: two hyperbolic cooling towers, the turbine hall and
  // a tall red-and-white chimney.
  {
    size: [36, 64, 32],
    voxel: (x, y, z) => {
      if (y === 0) return 'concreteDark'
      // Chimney.
      const cr = Math.hypot(x - 31.5, z - 4.5)
      if (cr <= 1.6 && y <= 63) {
        if (cr <= 0.6) return null
        return Math.floor(y / 6) % 2 ? 'red' : 'white'
      }
      // Cooling towers: waisted shells, open at the top.
      for (const [cx, cz] of [[9.5, 20.5], [24.5, 22.5]] as [number, number][]) {
        const r = Math.hypot(x - cx, z - cz)
        if (y > 36) continue
        const t = y / 36
        const radius = 8.6 - 4.2 * Math.sin(t * Math.PI * 0.85) + (t > 0.85 ? (t - 0.85) * 6 : 0)
        if (r <= radius && r > radius - 1.2) return y <= 2 ? 'concreteDark' : y % 9 === 0 ? 'concrete' : 'white'
      }
      // Turbine hall in front.
      if (between(x, 2, 28) && between(z, 1, 9) && y <= 14) {
        if (y === 14) return 'roofDark'
        if ((z === 1 || x === 28) && y >= 4 && y <= 11 && (z === 1 ? x : z) % 3 !== 0) return 'glassDark'
        return y % 5 === 0 ? 'trim' : 'concrete'
      }
      // Transformer yard.
      if (between(x, 29, 34) && between(z, 10, 16) && y <= 3) return (x + z) % 2 ? 'steel' : 'yellow'
      return null
    },
  },
  // 14 — Refinery: storage tanks, tall distillation columns with platforms,
  // a pipe rack and a flare stack with a flame on top.
  {
    size: [36, 56, 30],
    voxel: (x, y, z) => {
      if (y === 0) return (x + z) % 7 === 0 ? 'yellow' : 'concreteDark'
      // Storage tanks.
      for (const [cx, cz, r, h] of [[7, 22, 5, 9], [18, 23, 4.5, 8], [28, 22, 5, 10]] as [number, number, number, number][]) {
        const d = Math.hypot(x - cx, z - cz)
        if (d <= r && y <= h) return y === h ? 'steel' : y % 4 === 0 ? 'steelDark' : 'white'
      }
      // Distillation columns with platforms every 8.
      for (const [cx, cz, h] of [[8, 8, 44], [14, 7, 50], [20, 9, 38]] as [number, number, number][]) {
        const d = Math.hypot(x - cx, z - cz)
        if (d <= 1.6 && y <= h) return y % 8 === 0 ? 'yellow' : 'steel'
        if (y % 8 === 0 && y < h && d <= 2.8 && d > 1.6) return 'steelDark'
      }
      // Pipe rack between the columns and the tanks.
      if (between(z, 14, 15) && between(x, 3, 32) && (y === 6 || y === 9)) return y === 6 ? 'orange' : 'blue'
      if (between(z, 14, 15) && x % 6 === 3 && y <= 9) return 'steelDark'
      // Flare stack.
      const fd = Math.hypot(x - 31, z - 6)
      if (fd <= 0.8 && y <= 52) return 'steelDark'
      if (fd <= 1.4 && y > 52) return y > 54 ? 'yellow' : 'orange'
      // Control building.
      if (between(x, 25, 34) && between(z, 1, 9) && y <= 6) return y === 6 ? 'roofDark' : y === 3 && (x + z) % 2 ? 'glass' : 'concrete'
      return null
    },
  },
  // 15 — Steel mill: twin blast furnaces with stoves, a long rolling-mill
  // shed, a sloped conveyor and ore piles.
  {
    size: [36, 70, 32],
    voxel: (x, y, z) => {
      if (y === 0) return 'concreteDark'
      // Blast furnaces: tapering towers with a glowing band.
      for (const cx of [8, 20]) {
        const d = Math.hypot(x - cx, z - 22)
        const r = y < 30 ? 4.2 - y * 0.05 : 2.6
        if (d <= r && y <= 60) {
          if (y >= 6 && y <= 7) return 'orange'
          return y > 56 ? 'black' : y % 5 === 0 ? 'steel' : 'steelDark'
        }
        // Hot stoves next to each furnace.
        const sd = Math.hypot(x - (cx + 6), z - 26)
        if (sd <= 1.8 && y <= 34) return y > 31 ? 'roofDark' : 'concrete'
      }
      // Rolling-mill shed along the front.
      if (between(x, 1, 34) && between(z, 1, 11) && y <= 13) {
        if (y === 13) return z % 3 === 0 ? 'roof' : 'roofDark'
        if (z === 1 && y <= 5 && x % 8 >= 3 && x % 8 <= 5) return 'black'
        return y % 4 === 0 ? 'blue' : 'steel'
      }
      // Conveyor up to the furnace tops.
      const c = (x - 26) * 1.9
      if (between(x, 26, 34) && between(z, 18, 19) && Math.abs(y - (60 - c)) <= 0.6) return 'yellow'
      // Ore piles.
      const od = Math.hypot(x - 31, z - 27)
      if (y <= 5 - od * 1.1) return 'brickDark'
      return null
    },
  },
]

// The 2026-10 redesign: buildings with insides (see designs.ts), from
// index 16 on.
export const DESIGN_BASE = BLUEPRINTS.length
const ALL_DESIGNS = { ...HOUSE_DESIGNS, ...CITY_DESIGNS, ...INDUSTRIAL_DESIGNS }
for (const make of Object.values(ALL_DESIGNS)) BLUEPRINTS.push(make())
export const DESIGN = Object.fromEntries(Object.keys(ALL_DESIGNS).map((k, i) => [k, DESIGN_BASE + i])) as Record<keyof typeof ALL_DESIGNS, number>

export const BLUEPRINT_COUNT = BLUEPRINTS.length

// A built-in blueprint as a full grid (for copying into the admin's
// building editor): size and the colour at each cell, or null.
export function blueprintVoxels(blueprintIndex: number): { size: [number, number, number]; voxel: (x: number, y: number, z: number) => BrickColor | null } {
  const { size, voxel } = BLUEPRINTS[blueprintIndex % BLUEPRINTS.length]
  return { size, voxel }
}

const cache = new Map<number, Brick[]>()

export function getBricks(blueprintIndex: number): Brick[] {
  const cached = cache.get(blueprintIndex)
  if (cached) return cached

  const { size, voxel } = BLUEPRINTS[blueprintIndex % BLUEPRINTS.length]
  const [W, H, D] = size
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && voxel(x, y, z) !== null

  const bricks: Brick[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const color = voxel(x, y, z)
        if (!color) continue
        const interior =
          filled(x + 1, y, z) && filled(x - 1, y, z) && filled(x, y + 1, z) &&
          filled(x, y - 1, z) && filled(x, y, z + 1) && filled(x, y, z - 1)
        // z is flipped so the blueprint's z = 0 face ends up facing the
        // isometric camera rather than away from it.
        if (!interior || y === 0) bricks.push({ x: x - (W - 1) / 2, y, z: (D - 1) / 2 - z, color })
      }
    }
  }

  cache.set(blueprintIndex, bricks)
  return bricks
}

export function getBlueprintSize(blueprintIndex: number): [number, number, number] {
  return BLUEPRINTS[blueprintIndex % BLUEPRINTS.length].size
}
