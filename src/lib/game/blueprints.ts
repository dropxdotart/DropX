// Each building is a voxel function over a bounding box, reduced to its
// outer shell (any voxel with an empty neighbour) — interior fill is never
// visible, and dropping it keeps brick counts low enough to render every
// brick individually and take them out one at a time.
//
// Blueprint coordinates: z = 0 is the FRONT face and x = W - 1 is the right
// side — the two faces the isometric camera sees — so doors, signs and
// windows go there.

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
  // 4 — Shopping mall: storefront glass with striped awnings, a blue sign
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
  // 5 — Stadium: an elliptical bowl of tiered seats, a lined pitch, and
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
  // 6 — Cruise ship: tapered hull with a red waterline and portholes,
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
  // 7 — Space station: a ribbed central core, two gridded solar wings, a
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
]

export const BLUEPRINT_COUNT = BLUEPRINTS.length

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
