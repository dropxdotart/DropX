// Each structure is described as a voxel function over a bounding box, then
// reduced to its outer shell (any voxel with an empty neighbour) — interior
// fill is invisible anyway, and dropping it keeps brick counts low enough to
// render every brick individually and knock them off one at a time.

export const BRICK_COLORS = {
  brick: '#c4553a',
  brickDark: '#9e3f2a',
  glass: '#8ec9e8',
  roof: '#5a5f6b',
  roofRed: '#a8452f',
  concrete: '#b9b5ab',
  concreteDark: '#8f8b82',
  wood: '#b07b45',
  woodDark: '#7a5230',
  steel: '#8a96a3',
  white: '#f2f0ea',
  hull: '#2d3e57',
  red: '#d64545',
  blue: '#3f6fb5',
  panel: '#2f5f9e',
  yellow: '#f2c230',
  grass: '#6cb85a',
} as const

export type BrickColor = keyof typeof BRICK_COLORS

export type Brick = { x: number; y: number; z: number; color: BrickColor }

type Blueprint = {
  size: [number, number, number]
  voxel: (x: number, y: number, z: number) => BrickColor | null
}

const between = (v: number, a: number, b: number) => v >= a && v <= b

const BLUEPRINTS: Blueprint[] = [
  // Garden shed — wooden walls, door, one window, gable roof.
  {
    size: [6, 7, 5],
    voxel: (x, y, z) => {
      if (y < 4) {
        if (z === 0 && between(x, 2, 3) && y < 3) return 'woodDark'
        if (x === 0 && z === 2 && y === 2) return 'glass'
        return 'wood'
      }
      const k = y - 4
      return between(z, k, 4 - k) ? 'roofRed' : null
    },
  },
  // Old house — two floors of brick, window rows, gable roof, chimney.
  {
    size: [10, 12, 8],
    voxel: (x, y, z) => {
      if (x === 7 && z === 2 && y >= 7) return y <= 11 ? 'brickDark' : null
      if (y < 7) {
        const face = z === 0 || z === 7
        if (face && between(x, 4, 5) && y < 3 && z === 0) return 'woodDark'
        if (face && x % 3 === 1 && (between(y, 1, 2) || between(y, 4, 5))) return 'glass'
        return (x + y) % 4 === 0 ? 'brickDark' : 'brick'
      }
      const k = y - 7
      return between(z, k, 7 - k) ? 'roof' : null
    },
  },
  // Warehouse — concrete box, roller door, high window strip, flat roof.
  {
    size: [16, 8, 10],
    voxel: (x, y, z) => {
      if (y === 7) return 'roof'
      if (z === 0 && between(x, 5, 10) && y < 5) return 'steel'
      if (y === 5 && x % 2 === 0 && (z === 0 || z === 9)) return 'glass'
      if (y === 6) return 'concreteDark'
      return 'concrete'
    },
  },
  // Office tower — glass curtain wall with concrete floor bands.
  {
    size: [8, 26, 8],
    voxel: (x, y, z) => {
      if (y >= 24) return between(x, 2, 5) && between(z, 2, 5) ? 'steel' : y === 24 ? 'concrete' : null
      const corner = (x === 0 || x === 7) && (z === 0 || z === 7)
      if (y % 4 === 0 || corner) return 'concrete'
      return 'glass'
    },
  },
  // Shopping mall — white block, glass storefront, striped awning band.
  {
    size: [20, 9, 12],
    voxel: (x, y, z) => {
      if (y === 8) return 'roof'
      if (y === 5) return x % 2 === 0 ? 'red' : 'white'
      if (z === 0 && between(y, 1, 4) && between(x, 2, 17)) return 'glass'
      return 'white'
    },
  },
  // Stadium — an elliptical bowl whose stands rise with radius, colored seats.
  {
    size: [22, 8, 16],
    voxel: (x, y, z) => {
      const nx = (x - 10.5) / 11
      const nz = (z - 7.5) / 8
      const r = Math.sqrt(nx * nx + nz * nz)
      if (r > 1) return null
      if (r < 0.55) return y === 0 ? 'grass' : null
      const standHeight = ((r - 0.55) / 0.45) * 7
      if (y > standHeight) return null
      if (y === Math.floor(standHeight)) return y % 2 === 0 ? 'red' : 'blue'
      return 'concrete'
    },
  },
  // Cruise ship — tapered hull, white decks with window rows, red funnel.
  {
    size: [24, 12, 8],
    voxel: (x, y, z) => {
      const bow = x > 18 ? x - 18 : 0
      const zMin = Math.ceil(bow / 2)
      const zMax = 7 - zMin
      if (!between(z, zMin, zMax)) return null
      if (y < 4) return y < 2 ? 'hull' : y === 3 ? 'red' : 'white'
      if (between(x, 7, 9) && between(z, 3, 4)) return y <= 11 ? (y >= 10 ? 'hull' : 'red') : null
      const deck = y - 4
      if (deck > 3 || x < 2 + deck || x > 17 - deck || !between(z, 1, 6)) return null
      return (z === 1 || z === 6) && x % 2 === 0 && deck < 3 ? 'glass' : 'white'
    },
  },
  // Space station — central cylinder, two solar wings, dish on top.
  {
    size: [22, 13, 22],
    voxel: (x, y, z) => {
      const dx = x - 10.5
      const dz = z - 10.5
      const r = Math.sqrt(dx * dx + dz * dz)
      if (r <= 3.2 && y <= 10) return y % 3 === 0 ? 'steel' : 'white'
      if (y === 6 && Math.abs(dz) <= 2.5 && Math.abs(dx) > 3.2) return Math.abs(dx) % 3 < 0.6 ? 'steel' : 'panel'
      if (y >= 11 && r <= y - 9) return 'white'
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
        // z is flipped so a blueprint's z=0 face (doors, storefronts) ends up
        // facing the isometric camera rather than away from it.
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
