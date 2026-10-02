import { BRICK_COLORS, type BrickColor } from './blueprints'
import { cellIndex, COLOR_KEYS, SHAPE_LIMITS, type ShapeSize } from './shapes'

// Turns a real building's outline and OpenStreetMap tags (height, levels,
// roof shape, colours, material) into a Rubble shape. The map knows the
// footprint and height, not the facade, so walls get a generic window
// pattern in the building's colour — a starting point to touch up by hand.

export type MapTags = Record<string, string>
type P = { x: number; y: number } // metres, x east, y north

function num(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return /ft|'/.test(v) ? n * 0.3048 : n
}

// The palette colour nearest a CSS colour name or #hex.
const NAMED: Record<string, string> = {
  white: '#f2f0ea', black: '#2b2b2e', grey: '#9aa5b1', gray: '#9aa5b1', silver: '#bdc3c9', red: '#c4553a', brown: '#8a5a30',
  beige: '#d9c9a3', tan: '#c8ab7e', yellow: '#f2c230', orange: '#ef7d2d', blue: '#3f6fb5', green: '#6cb85a', maroon: '#8f3824',
  cream: '#efe6cf', sand: '#d8c49a', ivory: '#f4f1ea', navy: '#24365a',
}
function nearestColor(css: string | undefined, fallback: BrickColor): BrickColor {
  if (!css) return fallback
  const hex = NAMED[css.trim().toLowerCase()] ?? css.trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return fallback
  const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = rgb(m[1])
  let best = fallback
  let bestD = Infinity
  for (const key of ['brick', 'brickDark', 'brickLight', 'concrete', 'concreteDark', 'white', 'trim', 'wood', 'woodDark', 'steel', 'glass', 'glassDark', 'roof', 'roofRed', 'yellow', 'orange', 'blue', 'navy', 'red', 'black'] as BrickColor[]) {
    const [r2, g2, b2] = rgb(BRICK_COLORS[key].slice(1))
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (d < bestD) {
      bestD = d
      best = key
    }
  }
  return best
}

function wallColors(tags: MapTags): [BrickColor, BrickColor] {
  const material = (tags['building:material'] ?? tags['building:facade:material'] ?? '').toLowerCase()
  let base: BrickColor =
    material.includes('glass') ? 'glass' : material.includes('concrete') || material.includes('stone') || material.includes('plaster') ? 'concrete' : material.includes('wood') ? 'wood' : material.includes('metal') ? 'steel' : 'brick'
  base = nearestColor(tags['building:colour'], base)
  const alt: Partial<Record<BrickColor, BrickColor>> = { brick: 'brickDark', concrete: 'concreteDark', wood: 'woodDark', steel: 'steelDark', glass: 'glassDark', brickLight: 'brick' }
  return [base, alt[base] ?? base]
}

function inside(p: P, poly: P[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

export type MapBuilding = { size: ShapeSize; cells: Uint8Array; metresPerCell: number; heightM: number }

export function shapeFromFootprint(outline: P[], tags: MapTags): MapBuilding | null {
  if (outline.length < 3) return null
  // Square the building up: turn it so its longest wall runs along x.
  let angle = 0
  let longest = 0
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > longest) {
      longest = len
      angle = Math.atan2(b.y - a.y, b.x - a.x)
    }
  }
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  const pts = outline.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const w = Math.max(...pts.map((p) => p.x)) - minX
  const d = Math.max(...pts.map((p) => p.y)) - minY

  const levels = num(tags['building:levels'])
  const roofLevels = num(tags['roof:levels']) ?? 0
  const heightM = Math.max(3, num(tags.height) ?? (levels ? (levels + roofLevels) * 3.2 : 9))
  const roofShape = (tags['roof:shape'] ?? 'flat').toLowerCase()
  const roofM = num(tags['roof:height']) ?? (roofShape === 'flat' ? 0 : Math.min(w, d) * 0.4)
  const wallM = Math.max(3, heightM - (roofShape === 'flat' ? 0 : roofM))

  // Metres per brick: at least 1.2, more for big buildings so they fit.
  for (let mpc = Math.max(1.2, w / (SHAPE_LIMITS.maxW - 2), d / (SHAPE_LIMITS.maxD - 2), heightM / (SHAPE_LIMITS.maxH - 4)); ; mpc *= 1.15) {
    const W = Math.max(3, Math.ceil(w / mpc))
    const D = Math.max(3, Math.ceil(d / mpc))
    const wallH = Math.max(3, Math.round(wallM / mpc))
    // Footprint mask: cell centres inside the outline.
    const mask = new Uint8Array(W * D)
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        const p = { x: minX + (x + 0.5) * (w / W), y: minY + (z + 0.5) * (d / D) }
        if (inside(p, pts)) mask[x * D + z] = 1
      }
    if (!mask.some(Boolean)) return null
    // Distance (in cells) from each footprint cell to the outside, for roofs.
    const dist = new Int16Array(W * D).fill(0)
    const q: number[] = []
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        if (!mask[x * D + z]) continue
        const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1 || !mask[(x - 1) * D + z] || !mask[(x + 1) * D + z] || !mask[x * D + z - 1] || !mask[x * D + z + 1]
        if (edge) {
          dist[x * D + z] = 1
          q.push(x * D + z)
        }
      }
    for (let i = 0; i < q.length; i++) {
      const k = q[i]
      const x = Math.floor(k / D)
      const z = k % D
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue
        const n = nx * D + nz
        if (mask[n] && !dist[n]) {
          dist[n] = dist[k] + 1
          q.push(n)
        }
      }
    }
    const maxDist = Math.max(...dist)
    const roofCells = roofShape === 'flat' ? 2 : Math.max(2, Math.min(maxDist + 1, Math.round(roofM / mpc) + 1))
    const H = Math.min(SHAPE_LIMITS.maxH, wallH + roofCells)
    const size: ShapeSize = [W, H, D]
    const cells = new Uint8Array(W * H * D)
    const code = (col: BrickColor) => COLOR_KEYS.indexOf(col) + 1
    const [wall, wallAlt] = wallColors(tags)
    const roofCol = nearestColor(tags['roof:colour'], roofShape === 'flat' ? 'roof' : 'roofRed')
    const glass = wall === 'glass' ? 'glassDark' : 'glass'
    const floorH = Math.max(2, levels ? Math.round(wallH / Math.max(1, levels)) : Math.round(3.2 / mpc))
    const isEdge = (x: number, z: number) => dist[x * D + z] === 1

    for (let y = 0; y < wallH; y++) {
      const v = y % floorH
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          if (!mask[x * D + z]) continue
          let col: BrickColor = y % 2 ? wallAlt : wall
          if (isEdge(x, z) && y > 0) {
            const u = x + z
            const windowRow = floorH >= 3 ? v >= 1 && v <= floorH - 2 : v === 1
            if (wall === 'glass') col = u % 4 === 0 ? 'steel' : glass
            else if (windowRow && u % 3 !== 0) col = glass
            else if (v === 0 && floorH >= 3) col = 'trim'
          }
          cells[cellIndex(size, x, y, z)] = code(col)
        }
    }
    // Roof.
    const ridgeAlongX = W >= D
    for (let k = 0; k < roofCells && wallH + k < H; k++) {
      const y = wallH + k
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          if (!mask[x * D + z]) continue
          const dd = dist[x * D + z]
          let on = false
          if (roofShape === 'flat') on = k === 0 || (k === 1 && dd === 1)
          else if (roofShape === 'gabled') {
            const fromSide = ridgeAlongX ? Math.min(z + 1, D - z) : Math.min(x + 1, W - x)
            on = fromSide > k
          } else if (roofShape === 'dome' || roofShape === 'onion' || roofShape === 'round') {
            const rx = W / 2
            const rz = D / 2
            const dx = (x + 0.5 - rx) / rx
            const dz = (z + 0.5 - rz) / rz
            on = dx * dx + dz * dz + (k / roofCells) ** 2 <= 1
          } else on = dd > k // hipped, pyramidal, skillion…: step in from every side
          if (on) cells[cellIndex(size, x, y, z)] = code(roofShape === 'flat' && k === 1 ? 'trim' : roofCol)
        }
    }
    // Too many visible bricks? Try a coarser scale.
    let shell = 0
    for (let i = 0; i < cells.length; i++) if (cells[i]) shell++
    if (shell * 0.6 <= SHAPE_LIMITS.maxBricks || mpc > 50) return { size, cells, metresPerCell: mpc, heightM }
  }
}

// Lat/lon ring → metres around its first point.
export function toMetres(ring: { lat: number; lon: number }[]): P[] {
  const lat0 = ring[0].lat
  const lon0 = ring[0].lon
  const k = Math.cos((lat0 * Math.PI) / 180)
  return ring.map((p) => ({ x: (p.lon - lon0) * 111320 * k, y: (p.lat - lat0) * 110540 }))
}
