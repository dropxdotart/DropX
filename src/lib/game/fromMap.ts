import { BRICK_COLORS, type BrickColor } from './blueprints'
import { cellIndex, COLOR_KEYS, SHAPE_LIMITS, type ShapeSize } from './shapes'

// Turns a real building from OpenStreetMap into a Rubble shape. Buildings
// mapped in 3D come as "parts" — each with its own outline and its own
// height range (a wide ground floor, a narrower tower on top, the legs and
// decks of the Eiffel Tower…) — and each part is stacked at its height.
// Plainer buildings have one outline and a height. The map knows shapes
// and heights, not facades, so walls get a generic window pattern in the
// building's colour: a starting point to touch up by hand.

export type MapTags = Record<string, string>
type P = { x: number; y: number } // metres, x east, y north
export type MapPiece = { outline: P[]; tags: MapTags }

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
const PICKABLE: BrickColor[] = ['brick', 'brickDark', 'brickLight', 'concrete', 'concreteDark', 'white', 'trim', 'wood', 'woodDark', 'steel', 'steelDark', 'glass', 'glassDark', 'roof', 'roofDark', 'roofRed', 'yellow', 'orange', 'blue', 'navy', 'red', 'black']
function nearestColor(css: string | undefined, fallback: BrickColor): BrickColor {
  if (!css) return fallback
  const hex = NAMED[css.trim().toLowerCase()] ?? css.trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return fallback
  const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = rgb(m[1])
  let best = fallback
  let bestD = Infinity
  for (const key of PICKABLE) {
    const [r2, g2, b2] = rgb(BRICK_COLORS[key].slice(1))
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (d < bestD) {
      bestD = d
      best = key
    }
  }
  return best
}

const ALT: Partial<Record<BrickColor, BrickColor>> = {
  brick: 'brickDark', concrete: 'concreteDark', wood: 'woodDark', steel: 'steelDark', glass: 'glassDark', brickLight: 'brick', roof: 'roofDark', woodDark: 'wood',
}
function wallColors(tags: MapTags, main: MapTags): [BrickColor, BrickColor] {
  const material = (tags['building:material'] ?? main['building:material'] ?? tags['building:facade:material'] ?? '').toLowerCase()
  let base: BrickColor =
    material.includes('glass') ? 'glass' : material.includes('concrete') || material.includes('stone') || material.includes('plaster') ? 'concrete' : material.includes('wood') ? 'wood' : material.includes('metal') || material.includes('steel') ? 'steel' : 'brick'
  base = nearestColor(tags['building:colour'] ?? main['building:colour'], base)
  return [base, ALT[base] ?? base]
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

// Heights (metres) a piece spans, and its roof.
function span(tags: MapTags, fallbackTop: number) {
  const levels = num(tags['building:levels'])
  const minLevel = num(tags['building:min_level'])
  const top = num(tags.height) ?? (levels !== null ? (levels + (num(tags['roof:levels']) ?? 0)) * 3.2 + (minLevel ?? 0) * 3.2 : fallbackTop)
  const bottom = num(tags.min_height) ?? (minLevel !== null ? minLevel * 3.2 : 0)
  return { bottom: Math.min(bottom, top - 0.5), top, levels, roof: (tags['roof:shape'] ?? 'flat').toLowerCase(), roofM: num(tags['roof:height']) }
}

export type MapBuilding = { size: ShapeSize; cells: Uint8Array; metresPerCell: number; heightM: number; parts: number }

// `main` is the building itself (its outline and tags); `parts` its 3D
// parts, if the map has any (then they replace the plain outline).
export function shapeFromMap(main: MapPiece, parts: MapPiece[]): MapBuilding | null {
  const usable = parts.filter((p) => p.outline.length >= 3 && p.tags['building:part'] !== 'no')
  const pieces = usable.length ? usable : [main]
  if (main.outline.length < 3) return null
  const mainSpan = span(main.tags, 9)
  const lattice = main.tags.man_made === 'tower' || main.tags.building === 'tower' || main.tags.man_made === 'mast'

  // Square everything up to the building's longest wall.
  let angle = 0
  let longest = 0
  for (let i = 0; i < main.outline.length; i++) {
    const a = main.outline[i]
    const b = main.outline[(i + 1) % main.outline.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > longest) {
      longest = len
      angle = Math.atan2(b.y - a.y, b.x - a.x)
    }
  }
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  const rot = (pts: P[]) => pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
  const shapes = pieces.map((p) => {
    const sp = span(p.tags, mainSpan.top)
    return { pts: rot(p.outline), tags: p.tags, ...sp }
  })
  const all = shapes.flatMap((p) => p.pts)
  const minX = Math.min(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const w = Math.max(...all.map((p) => p.x)) - minX
  const d = Math.max(...all.map((p) => p.y)) - minY
  const heightM = Math.max(3, ...shapes.map((p) => p.top))

  for (let mpc = Math.max(1.2, w / (SHAPE_LIMITS.maxW - 2), d / (SHAPE_LIMITS.maxD - 2), heightM / (SHAPE_LIMITS.maxH - 2)); ; mpc *= 1.15) {
    const W = Math.max(3, Math.ceil(w / mpc))
    const D = Math.max(3, Math.ceil(d / mpc))
    const H = Math.min(SHAPE_LIMITS.maxH, Math.max(3, Math.round(heightM / mpc)))
    const size: ShapeSize = [W, H, D]
    const cells = new Uint8Array(W * H * D)
    const code = (col: BrickColor) => COLOR_KEYS.indexOf(col) + 1
    const put = (x: number, y: number, z: number, col: BrickColor) => {
      if (y >= 0 && y < H) cells[cellIndex(size, x, y, z)] = code(col)
    }

    for (const piece of shapes) {
      // Footprint mask and each cell's distance (in cells) to its edge.
      const mask = new Uint8Array(W * D)
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          const p = { x: minX + (x + 0.5) * (w / W), y: minY + (z + 0.5) * (d / D) }
          if (inside(p, piece.pts)) mask[x * D + z] = 1
        }
      if (!mask.some(Boolean)) {
        // Thinner than a brick: keep it as the nearest single column.
        const cx = piece.pts.reduce((n, p) => n + p.x, 0) / piece.pts.length
        const cz = piece.pts.reduce((n, p) => n + p.y, 0) / piece.pts.length
        const x = Math.max(0, Math.min(W - 1, Math.floor((cx - minX) / (w / W))))
        const z = Math.max(0, Math.min(D - 1, Math.floor((cz - minY) / (d / D))))
        mask[x * D + z] = 1
      }
      const dist = new Int16Array(W * D)
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

      const y0 = Math.round(piece.bottom / mpc)
      const yTop = Math.max(y0 + 1, Math.round(piece.top / mpc))
      const roofShape = piece.roof
      const roofCells =
        roofShape === 'flat' || roofShape === 'skillion' ? 0 : Math.max(1, Math.min(maxDist, Math.round((piece.roofM ?? Math.min(w, d) * 0.3) / mpc)))
      const wallTop = yTop - roofCells
      const [wall, wallAlt] = wallColors(piece.tags, main.tags)
      const roofCol = nearestColor(piece.tags['roof:colour'] ?? main.tags['roof:colour'], roofShape === 'flat' ? 'roof' : 'roofRed')
      const glass = wall === 'glass' ? 'glassDark' : 'glass'
      const levels = piece.levels ?? mainSpan.levels
      const floorH = Math.max(2, levels ? Math.round((wallTop - y0) / Math.max(1, levels)) : Math.round(3.2 / mpc))
      const windows = !lattice && piece.tags['building:part'] !== 'roof'

      for (let y = y0; y < wallTop; y++) {
        const v = (y - y0) % floorH
        for (let x = 0; x < W; x++)
          for (let z = 0; z < D; z++) {
            if (!mask[x * D + z]) continue
            const edge = dist[x * D + z] === 1
            if (lattice) {
              // Open ironwork: a frame of the outline with criss-cross gaps.
              if (!edge && y > y0) continue
              if (edge && y > y0 && (x + z + y) % 3 === 0) continue
              put(x, y, z, (x + z + y) % 2 ? wall : wallAlt)
              continue
            }
            let col: BrickColor = y % 2 ? wallAlt : wall
            if (edge && y > 0 && windows) {
              const u = x + z
              const windowRow = floorH >= 3 ? v >= 1 && v <= floorH - 2 : v === 1
              if (wall === 'glass') col = u % 4 === 0 ? 'steel' : glass
              else if (windowRow && u % 3 !== 0) col = glass
              else if (v === 0 && floorH >= 3 && y > y0) col = 'trim'
            }
            put(x, y, z, col)
          }
      }
      // Roof of this piece.
      const ridgeAlongX = W >= D
      for (let k = 0; k < roofCells; k++) {
        const y = wallTop + k
        for (let x = 0; x < W; x++)
          for (let z = 0; z < D; z++) {
            if (!mask[x * D + z]) continue
            const dd = dist[x * D + z]
            let on: boolean
            if (roofShape === 'gabled') on = (ridgeAlongX ? Math.min(z + 1, D - z) : Math.min(x + 1, W - x)) > k
            else if (roofShape === 'dome' || roofShape === 'onion' || roofShape === 'round') {
              const rx = Math.max(1, maxDist)
              on = dd > (k / roofCells) * rx - 0.5
            } else on = dd > k // hipped, pyramidal…: step in from every side
            if (on) put(x, y, z, roofCol)
          }
      }
      // Flat roofs get a parapet edge (not on ironwork or hidden roof parts).
      if (roofCells === 0 && !lattice && wallTop < H && piece.tags['building:part'] !== 'roof')
        for (let x = 0; x < W; x++)
          for (let z = 0; z < D; z++) if (mask[x * D + z] && dist[x * D + z] === 1) put(x, wallTop - 1, z, 'trim')
    }

    let filled = 0
    for (let i = 0; i < cells.length; i++) if (cells[i]) filled++
    if (filled * 0.6 <= SHAPE_LIMITS.maxBricks || mpc > 50) return { size, cells, metresPerCell: mpc, heightM, parts: usable.length }
  }
}

// Lat/lon rings → metres around a shared origin.
export function toMetres(ring: { lat: number; lon: number }[], origin = ring[0]): P[] {
  const k = Math.cos((origin.lat * Math.PI) / 180)
  return ring.map((p) => ({ x: (p.lon - origin.lon) * 111320 * k, y: (p.lat - origin.lat) * 110540 }))
}
