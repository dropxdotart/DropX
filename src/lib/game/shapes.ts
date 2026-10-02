import { BRICK_COLORS, type Brick, type BrickColor } from './blueprints'

// Admin-made building shapes. A shape is a W×H×D grid of cells, each empty
// (0) or a brick colour (1 + its index in COLOR_KEYS). Stored compressed
// (run-length, base64) so it fits in the database and in saves. Like the
// built-in blueprints, only the outer shell becomes bricks.
//
// Grid coordinates match the blueprints: z = 0 is the FRONT face and
// x = W − 1 the right side (the two faces the camera sees).

export const COLOR_KEYS = Object.keys(BRICK_COLORS) as BrickColor[]

// The footprint leaves room on the lot for dumpsters and workers; height
// and brick count allow huge buildings that take hours (or a night) to
// clear. Very big ones draw with plain boxes (see Building.tsx).
export const SHAPE_LIMITS = { maxW: 36, maxH: 120, maxD: 32, maxBricks: 20000 }

export type ShapeSize = [number, number, number]
export type Shape = { size: ShapeSize; data: string }

export const cellIndex = (size: ShapeSize, x: number, y: number, z: number) => (y * size[0] + x) * size[2] + z

// Run-length pairs of (count 1–255, value), base64.
export function encodeCells(cells: Uint8Array): string {
  const out: number[] = []
  let i = 0
  while (i < cells.length) {
    const v = cells[i]
    let n = 1
    while (i + n < cells.length && cells[i + n] === v && n < 255) n++
    out.push(n, v)
    i += n
  }
  let s = ''
  for (const b of out) s += String.fromCharCode(b)
  return btoa(s)
}

export function decodeCells(size: ShapeSize, data: string): Uint8Array {
  const cells = new Uint8Array(size[0] * size[1] * size[2])
  try {
    const s = atob(data)
    let at = 0
    for (let i = 0; i + 1 < s.length && at < cells.length; i += 2) {
      const n = s.charCodeAt(i)
      const v = s.charCodeAt(i + 1)
      cells.fill(v, at, Math.min(cells.length, at + n))
      at += n
    }
  } catch {
    // corrupt shape — empty
  }
  return cells
}

// The visible bricks: every filled cell with an empty neighbour (plus the
// ground layer), centred like the blueprints and with z flipped so the
// front faces the camera.
export function bricksFromCells(size: ShapeSize, cells: Uint8Array): Brick[] {
  const [W, H, D] = size
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && cells[cellIndex(size, x, y, z)] !== 0
  const bricks: Brick[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const v = cells[cellIndex(size, x, y, z)]
        if (!v) continue
        const interior =
          filled(x + 1, y, z) && filled(x - 1, y, z) && filled(x, y + 1, z) && filled(x, y - 1, z) && filled(x, y, z + 1) && filled(x, y, z - 1)
        if (!interior || y === 0) bricks.push({ x: x - (W - 1) / 2, y, z: (D - 1) / 2 - z, color: COLOR_KEYS[v - 1] ?? 'brick' })
      }
    }
  }
  return bricks
}

// ── Slider builder ──────────────────────────────────────────────────────

export type RoofStyle = 'flat' | 'gable' | 'dome' | 'none'
export type WindowStyle = 'none' | 'windows' | 'bands' | 'grid'

export type BuilderParams = {
  width: number
  depth: number
  floors: number
  floorHeight: number
  roof: RoofStyle
  windows: WindowStyle
  door: boolean
  corners: boolean // trim-coloured corner columns
  wall: BrickColor
  wallAlt: BrickColor // every other row, for texture
  roofColor: BrickColor
  windowColor: BrickColor
  trim: BrickColor
}

export const DEFAULT_PARAMS: BuilderParams = {
  width: 14,
  depth: 12,
  floors: 3,
  floorHeight: 5,
  roof: 'flat',
  windows: 'windows',
  door: true,
  corners: true,
  wall: 'brick',
  wallAlt: 'brickDark',
  roofColor: 'roof',
  windowColor: 'glass',
  trim: 'trim',
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)))

function roofHeight(p: BuilderParams) {
  if (p.roof === 'flat') return 2
  if (p.roof === 'gable') return Math.ceil(p.depth / 2) + 1
  if (p.roof === 'dome') return Math.ceil(Math.min(p.width, p.depth) * 0.4) + 1
  return 0
}

// Generates a whole building from the sliders. Walls are solid blocks;
// only the shell ends up as bricks.
export function generateShape(raw: BuilderParams): { size: ShapeSize; cells: Uint8Array } {
  const p = {
    ...raw,
    width: clamp(raw.width, 5, SHAPE_LIMITS.maxW),
    depth: clamp(raw.depth, 5, SHAPE_LIMITS.maxD),
    floorHeight: clamp(raw.floorHeight, 3, 7),
  }
  const maxFloors = Math.floor((SHAPE_LIMITS.maxH - roofHeight(p)) / p.floorHeight)
  p.floors = clamp(raw.floors, 1, Math.max(1, maxFloors))
  const W = p.width
  const D = p.depth
  const wallTop = p.floors * p.floorHeight
  const H = wallTop + roofHeight(p)
  const size: ShapeSize = [W, H, D]
  const cells = new Uint8Array(W * H * D)
  const code = (c: BrickColor) => COLOR_KEYS.indexOf(c) + 1
  const set = (x: number, y: number, z: number, c: BrickColor) => {
    if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D) cells[cellIndex(size, x, y, z)] = code(c)
  }

  // Walls, floor by floor.
  for (let y = 0; y < wallTop; y++) {
    const v = y % p.floorHeight
    const floorLine = v === 0 && y > 0
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const edgeX = x === 0 || x === W - 1
        const edgeZ = z === 0 || z === D - 1
        if (!edgeX && !edgeZ) {
          set(x, y, z, p.wall) // interior fill (hidden)
          continue
        }
        const corner = edgeX && edgeZ
        // Position along this face and its length.
        const u = edgeZ ? x : z
        const len = edgeZ ? W : D
        let c: BrickColor = y % 2 === 0 ? p.wall : p.wallAlt
        if (corner && p.corners) c = p.trim
        else if (floorLine && p.windows !== 'grid') c = p.trim
        else if (!corner && u > 0 && u < len - 1) {
          const inWindowRow = v >= 1 && v <= p.floorHeight - 2
          if (p.windows === 'windows' && inWindowRow && u % 4 >= 1 && u % 4 <= 2 && u < len - 1) c = p.windowColor
          if (p.windows === 'bands' && inWindowRow) c = p.windowColor
          if (p.windows === 'grid') c = u % 3 === 0 || v === 0 ? 'steel' : p.windowColor
        }
        set(x, y, z, c)
      }
    }
  }

  // Front door, centred, framed in trim.
  if (p.door) {
    const mid = Math.floor(W / 2)
    for (let y = 0; y <= Math.min(4, wallTop - 1); y++) {
      for (let x = mid - 2; x <= mid + 1; x++) {
        const frame = x === mid - 2 || x === mid + 1 || y === 4
        set(x, y, 0, frame ? p.trim : 'door')
      }
    }
  }

  // Roof.
  if (p.roof === 'flat') {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        set(x, wallTop, z, p.roofColor)
        if (x === 0 || z === 0 || x === W - 1 || z === D - 1) set(x, wallTop + 1, z, p.trim)
      }
    }
  } else if (p.roof === 'gable') {
    // Ridge runs left–right; eaves overhang front and back by one.
    for (let k = 0; ; k++) {
      const z0 = k - 1
      const z1 = D - k
      if (z0 > z1) break
      for (let x = 0; x < W; x++) {
        for (let z = z0; z <= z1; z++) {
          const gableEnd = (x === 0 || x === W - 1) && z > z0 && z < z1
          set(x, wallTop + k, z, gableEnd ? p.wall : p.roofColor)
        }
      }
    }
  } else if (p.roof === 'dome') {
    const rx = W / 2
    const rz = D / 2
    const ry = roofHeight(p) - 1
    for (let y = 0; y <= ry; y++) {
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const dx = (x + 0.5 - rx) / rx
          const dz = (z + 0.5 - rz) / rz
          const dy = y / Math.max(1, ry)
          if (dx * dx + dz * dz + dy * dy <= 1) set(x, wallTop + y, z, p.roofColor)
        }
      }
    }
  }

  return { size, cells }
}
