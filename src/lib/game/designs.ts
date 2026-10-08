// Hand-designed buildings (2026-10 redesign): built in a voxel grid with
// real insides — floor slabs, rooms, stairs and furniture made of bricks —
// so as the crew peels the walls away you uncover the building's interior.
// Only bricks touching air are kept (see getBricks), so walls, floors and
// furniture are one brick thick and solid lumps cost nothing extra.
//
// Same coordinates as blueprints.ts: z = 0 is the FRONT face and x = W − 1
// the right side — the two faces the camera sees — so doors, signs and the
// best windows go there.

import type { BrickColor as C } from './blueprints'

export type Blueprint = { size: [number, number, number]; voxel: (x: number, y: number, z: number) => C | null }

// A colour, null (clear the cell) or a function of the cell — returning
// undefined leaves whatever is there.
type Paint = C | null | ((x: number, y: number, z: number) => C | null | undefined)

export class Voxels {
  readonly cells: (C | null)[]
  constructor(
    readonly W: number,
    readonly H: number,
    readonly D: number
  ) {
    this.cells = new Array(W * H * D).fill(null)
  }
  private at(x: number, y: number, z: number) {
    return (y * this.W + x) * this.D + z
  }
  ok(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.H && z < this.D
  }
  set(x: number, y: number, z: number, c: C | null) {
    if (this.ok(x, y, z)) this.cells[this.at(x, y, z)] = c
  }
  get(x: number, y: number, z: number): C | null {
    return this.ok(x, y, z) ? this.cells[this.at(x, y, z)] : null
  }
  private paint(x: number, y: number, z: number, p: Paint) {
    const c = typeof p === 'function' ? p(x, y, z) : p
    if (c !== undefined) this.set(x, y, z, c)
  }
  // A solid box (corners inclusive, any order).
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Paint) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.paint(x, y, z, p)
  }
  // Just the outside ring of each layer — walls.
  ring(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: Paint) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) if (x === x0 || x === x1 || z === z0 || z === z1) this.paint(x, y, z, p)
  }
  done(): Blueprint {
    const { W, H, D, cells } = this
    return { size: [W, H, D], voxel: (x, y, z) => cells[(y * W + x) * D + z] }
  }
}

// ── Pieces ─────────────────────────────────────────────────────────────

// Window panes along a wall: `u` how far along it, `v` the height above the
// storey's floor. Glass in a white frame, every `step` bricks.
export function pane(u: number, v: number, o: { step: number; w: number; sill: number; h: number; offset?: number; frame?: C; glass?: C }): C | undefined {
  const k = (((u - (o.offset ?? 1)) % o.step) + o.step) % o.step
  const inU = k >= 1 && k <= o.w
  const inV = v >= o.sill && v < o.sill + o.h
  if (inU && inV) return o.glass ?? 'glass'
  const frameU = k >= 0 && k <= o.w + 1
  const frameV = v >= o.sill - 1 && v <= o.sill + o.h
  if (frameU && frameV) return o.frame ?? 'trim'
  return undefined
}

// Walls of one storey with windows on every face (u runs along each face).
function storey(
  v: Voxels,
  r: { x0: number; z0: number; x1: number; z1: number },
  y: number,
  h: number,
  wall: (x: number, y: number, z: number) => C,
  win: { step: number; w: number; sill: number; h: number; offset?: number; frame?: C; glass?: C } | null
) {
  v.ring(r.x0, y, r.z0, r.x1, y + h - 1, r.z1, (x, yy, z) => {
    const corner = (x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1)
    if (!corner && win) {
      const u = z === r.z0 || z === r.z1 ? x - r.x0 : z - r.z0
      const len = z === r.z0 || z === r.z1 ? r.x1 - r.x0 : r.z1 - r.z0
      if (u >= 2 && u <= len - 2) {
        const p = pane(u, yy - y, win)
        if (p) return p
      }
    }
    return wall(x, yy, z)
  })
}

// A doorway: clears the wall and puts a door leaf (and frame) in it. Face
// 'front' is z = z0 (u = x), 'right' is x = x1 (u = z).
function door(v: Voxels, face: 'front' | 'right', at: number, line: number, y: number, w: number, h: number, leaf: C = 'door', frame: C = 'trim') {
  for (let u = at - 1; u <= at + w; u++)
    for (let k = 0; k <= h; k++) {
      const edge = u === at - 1 || u === at + w || k === h
      const c: C = edge ? frame : leaf
      if (face === 'front') v.set(u, y + k, line, c)
      else v.set(line, y + k, u, c)
    }
}

// A flight of stairs climbing `rise` steps along +x (or +z) from (x, y, z).
function stairs(v: Voxels, x: number, y: number, z: number, rise: number, along: 'x' | 'z', width = 2, c: C = 'woodDark') {
  for (let s = 0; s < rise; s++)
    for (let w = 0; w < width; w++) {
      if (along === 'x') v.set(x + s, y + s, z + w, c)
      else v.set(x + w, y + s, z + s, c)
    }
}

// Furniture, standing on the floor at height y.
const furniture = {
  bed(v: Voxels, x: number, y: number, z: number, sheet: C = 'blue') {
    v.box(x, y, z, x + 1, y, z + 2, 'woodDark')
    v.box(x, y + 1, z + 1, x + 1, y + 1, z + 2, sheet)
    v.box(x, y + 1, z, x + 1, y + 1, z, 'white')
    v.box(x, y + 1, z - 1, x + 1, y + 2, z - 1, 'wood') // headboard
  },
  table(v: Voxels, x: number, y: number, z: number, w = 2, d = 2, top: C = 'wood') {
    v.set(x, y, z, 'woodDark')
    v.set(x + w - 1, y, z + d - 1, 'woodDark')
    v.box(x, y + 1, z, x + w - 1, y + 1, z + d - 1, top)
  },
  chair(v: Voxels, x: number, y: number, z: number, c: C = 'woodDark') {
    v.set(x, y, z, c)
  },
  sofa(v: Voxels, x: number, y: number, z: number, len = 3, c: C = 'red', along: 'x' | 'z' = 'x') {
    for (let k = 0; k < len; k++) {
      if (along === 'x') {
        v.set(x + k, y, z, c)
        v.set(x + k, y + 1, z + 1, c)
        v.set(x + k, y, z + 1, c)
      } else {
        v.set(x, y, z + k, c)
        v.set(x + 1, y + 1, z + k, c)
        v.set(x + 1, y, z + k, c)
      }
    }
  },
  shelf(v: Voxels, x: number, y: number, z: number, h = 3, len = 2, along: 'x' | 'z' = 'x', goods: C[] = ['red', 'yellow', 'blue', 'green']) {
    for (let k = 0; k < len; k++)
      for (let j = 0; j < h; j++) {
        const c = j % 2 === 0 ? 'woodDark' : goods[(k + j) % goods.length]
        if (along === 'x') v.set(x + k, y + j, z, c)
        else v.set(x, y + j, z + k, c)
      }
  },
  tv(v: Voxels, x: number, y: number, z: number, along: 'x' | 'z' = 'x') {
    for (let k = 0; k < 2; k++) {
      if (along === 'x') v.set(x + k, y + 1, z, 'black')
      else v.set(x, y + 1, z + k, 'black')
    }
    v.set(x, y, z, 'woodDark')
  },
  plant(v: Voxels, x: number, y: number, z: number) {
    v.set(x, y, z, 'brickDark')
    v.set(x, y + 1, z, 'green')
  },
  rug(v: Voxels, x: number, y: number, z: number, w: number, d: number, c: C = 'carpet') {
    v.box(x, y - 1, z, x + w - 1, y - 1, z + d - 1, c) // replaces the floor
  },
  bath(v: Voxels, x: number, y: number, z: number) {
    v.box(x, y, z, x + 1, y, z + 2, 'white')
    v.box(x, y, z + 1, x + 1, y, z + 1, 'water')
    v.set(x + 2, y, z, 'white') // toilet
  },
  counter(v: Voxels, x: number, y: number, z: number, len: number, along: 'x' | 'z' = 'x', top: C = 'trim', base: C = 'wood') {
    for (let k = 0; k < len; k++) {
      if (along === 'x') {
        v.set(x + k, y, z, base)
        v.set(x + k, y + 1, z, top)
      } else {
        v.set(x, y, z + k, base)
        v.set(x, y + 1, z + k, top)
      }
    }
  },
  crate(v: Voxels, x: number, y: number, z: number, c: C = 'wood') {
    v.box(x, y, z, x + 1, y + 1, z + 1, c)
  },
  // A small car, nose toward −z (the front), 3 wide × 6 long.
  car(v: Voxels, x: number, y: number, z: number, body: C = 'red') {
    v.box(x, y + 1, z, x + 2, y + 1, z + 5, body)
    v.box(x, y + 2, z + 1, x + 2, y + 2, z + 4, body)
    v.box(x, y + 3, z + 2, x + 2, y + 3, z + 3, 'glassDark')
    for (const [wx, wz] of [
      [x, z + 1],
      [x + 2, z + 1],
      [x, z + 4],
      [x + 2, z + 4],
    ] as [number, number][])
      v.set(wx, y, wz, 'black')
    v.set(x, y + 1, z, 'yellow')
    v.set(x + 2, y + 1, z, 'yellow')
  },
}

// A gable roof over x0..x1 × z0..z1 from height y: slopes front and back
// (a one-brick shell), closed gable ends, eaves one past the walls.
function gableRoof(v: Voxels, x0: number, z0: number, x1: number, z1: number, y: number, a: C, b: C, end: C) {
  for (let k = 0; z0 + k <= z1 - k; k++) {
    const c = k % 2 === 0 ? a : b
    // Each course is two bricks deep so the steps overlap (no gaps).
    for (let x = x0 - 1; x <= x1 + 1; x++)
      for (const z of [z0 - 1 + k, z0 + k, z1 + 1 - k, z1 - k]) v.set(x, y + k, z, c)
    // Gable ends fill the triangle.
    for (let z = z0 + k + 1; z <= z1 - k - 1; z++) {
      v.set(x0, y + k, z, end)
      v.set(x1, y + k, z, end)
    }
  }
}

// A chimney from y0 up to y1 at (x, z).
function chimney(v: Voxels, x: number, z: number, y0: number, y1: number) {
  v.box(x, y0, z, x + 1, y1, z + 1, (_x, y) => (y === y1 ? 'concreteDark' : 'brickDark'))
}

// ── Houses island ──────────────────────────────────────────────────────

// Garden shed: plank walls, a workbench and tool shelf, a mower and paint
// cans inside, a shingled roof on open rafters.
function shed(): Blueprint {
  const v = new Voxels(13, 13, 12)
  const r = { x0: 1, z0: 1, x1: 11, z1: 10 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'woodDark')
  storey(v, r, 1, 6, (_x, y) => (y % 2 === 0 ? 'wood' : 'woodDark'), { step: 6, w: 2, sill: 2, h: 2, offset: 3 })
  door(v, 'front', 5, r.z0, 1, 2, 4)
  // Workbench along the back with tools hung above it.
  furniture.counter(v, 3, 1, 9, 6, 'x', 'wood', 'woodDark')
  for (let x = 3; x <= 8; x += 2) v.set(x, 4, 9, x % 4 === 1 ? 'steel' : 'red')
  furniture.shelf(v, 2, 1, 3, 4, 4, 'z', ['red', 'yellow', 'steel', 'green'])
  // Mower and paint cans.
  v.box(8, 1, 3, 9, 1, 4, 'red')
  v.set(9, 2, 3, 'black')
  for (const [x, z, c] of [
    [10, 7, 'blue'],
    [10, 8, 'yellow'],
    [9, 8, 'white'],
  ] as [number, number, C][])
    v.set(x, 1, z, c)
  gableRoof(v, r.x0, r.z0, r.x1, r.z1, 7, 'roofRed', 'roofRedDark', 'wood')
  return v.done()
}

// Garage: brick walls, a half-raised roller door, a car inside, tool wall,
// shelves of tyres and cans, flat roof with a parapet.
function garage(): Blueprint {
  const v = new Voxels(17, 11, 16)
  const r = { x0: 1, z0: 1, x1: 15, z1: 14 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'concreteDark')
  v.box(4, 0, 0, 12, 0, 0, 'concrete') // driveway apron
  storey(v, r, 1, 7, (x, y) => ((x + y) % 6 === 0 ? 'brickDark' : 'brick'), { step: 5, w: 2, sill: 3, h: 2, offset: 2 })
  // Roller door: raised halfway — the lower half is open.
  for (let x = 3; x <= 13; x++)
    for (let y = 1; y <= 6; y++) v.set(x, y, r.z0, x === 3 || x === 13 ? 'trim' : y >= 4 ? (y % 2 === 0 ? 'steel' : 'steelDark') : null)
  v.box(3, 7, r.z0, 13, 7, r.z0, 'trim')
  door(v, 'right', 10, r.x1, 1, 2, 4)
  furniture.car(v, 5, 1, 4, 'red')
  // Tool wall and bench on the left.
  furniture.counter(v, 2, 1, 4, 7, 'z', 'wood', 'woodDark')
  for (let z = 4; z <= 10; z += 2) v.set(2, 4, z, z % 4 === 0 ? 'steel' : 'orange')
  // Tyres and shelves at the back.
  for (let x = 10; x <= 13; x++) furniture.shelf(v, x, 1, 13, 4, 1, 'x', ['black', 'yellow', 'blue'])
  v.box(11, 1, 6, 12, 2, 7, 'black')
  // Roof with parapet and a skylight.
  v.box(r.x0, 8, r.z0, r.x1, 8, r.z1, (x, _y, z) => (x >= 6 && x <= 9 && z >= 6 && z <= 8 ? 'glass' : 'roof'))
  v.ring(r.x0, 9, r.z0, r.x1, 9, r.z1, 'concrete')
  v.box(12, 9, 11, 13, 9, 12, 'steelDark')
  return v.done()
}

// Cottage: one storey of cream walls on a stone base with a porch, rooms
// (living room, kitchen, bedroom, bathroom), a red roof with an attic of
// boxes and a chimney.
function cottage(): Blueprint {
  const v = new Voxels(21, 17, 19)
  const r = { x0: 1, z0: 3, x1: 19, z1: 17 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'wood')
  v.box(4, 0, 0, 10, 0, 2, 'woodDark') // porch deck
  for (const x of [4, 10]) v.box(x, 1, 0, x, 5, 0, 'white') // porch posts
  v.box(3, 6, 0, 11, 6, 2, 'roofRedDark') // porch roof
  storey(v, r, 1, 6, (_x, y) => (y === 1 ? 'stone' : 'cream'), { step: 5, w: 2, sill: 2, h: 3, offset: 1 })
  door(v, 'front', 7, r.z0, 1, 2, 4, 'green')
  // Inner walls: hall down the middle, rooms either side.
  v.box(10, 1, r.z0 + 1, 10, 6, r.z1 - 1, (_x, y, z) => (z >= 9 && z <= 10 && y <= 4 ? null : 'white'))
  v.box(r.x0 + 1, 1, 11, 9, 6, 11, (x, y) => (x >= 4 && x <= 5 && y <= 4 ? null : 'white'))
  v.box(11, 1, 12, r.x1 - 1, 6, 12, (x, y) => (x >= 14 && x <= 15 && y <= 4 ? null : 'white'))
  // Living room (front left): sofa, rug, TV, plant.
  furniture.rug(v, 3, 1, 5, 5, 4)
  furniture.sofa(v, 3, 1, 8, 4, 'blue')
  furniture.tv(v, 4, 1, 4)
  furniture.plant(v, 9, 1, 4)
  // Kitchen (front right): counter, table and chairs.
  furniture.counter(v, 12, 1, 4, 7)
  furniture.table(v, 14, 1, 7, 3, 2)
  for (const [x, z] of [
    [13, 7],
    [17, 8],
    [15, 9],
  ])
    furniture.chair(v, x, 1, z)
  // Bedroom (back left) and bathroom (back right).
  furniture.bed(v, 3, 1, 13, 'pink')
  furniture.shelf(v, 8, 1, 15, 3, 1)
  furniture.bath(v, 15, 1, 14)
  v.box(r.x0, 7, r.z0, r.x1, 7, r.z1, 'woodDark') // ceiling / attic floor
  gableRoof(v, r.x0, r.z0, r.x1, r.z1, 8, 'roofRed', 'roofRedDark', 'cream')
  for (const [x, z] of [
    [5, 9],
    [8, 10],
    [14, 9],
  ])
    furniture.crate(v, x, 8, z, 'woodDark')
  chimney(v, 18, 6, 1, 15)
  return v.done()
}

// Old house: two floors of brick with corner quoins, a stoop, stairs, a
// living room and dining room downstairs, bedrooms upstairs, an attic and
// a chimney.
function oldHouse(): Blueprint {
  const v = new Voxels(23, 23, 19)
  const r = { x0: 1, z0: 2, x1: 21, z1: 17 }
  const wall = (x: number, y: number, z: number): C =>
    (x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1) && y % 2 === 0 ? 'brickLight' : (x + y + z) % 7 === 0 ? 'brickDark' : 'brick'
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'woodDark')
  v.box(8, 0, 0, 12, 1, 1, 'concrete') // stoop
  storey(v, r, 1, 5, wall, { step: 5, w: 2, sill: 2, h: 2 })
  v.box(r.x0, 6, r.z0, r.x1, 6, r.z1, (x, _y, z) => (x >= 15 && x <= 17 && z >= 11 && z <= 15 ? null : 'wood')) // first floor (stairwell open)
  v.ring(r.x0, 6, r.z0, r.x1, 6, r.z1, 'trim')
  storey(v, r, 7, 5, wall, { step: 5, w: 2, sill: 1, h: 3 })
  door(v, 'front', 9, r.z0, 1, 3, 4, 'navy')
  // Downstairs: living (left), dining (right), stairs at the back right.
  v.box(11, 1, r.z0 + 1, 11, 5, r.z1 - 1, (_x, y, z) => (z >= 6 && z <= 8 && y <= 4 ? null : 'cream'))
  furniture.rug(v, 3, 1, 5, 6, 5, 'purple')
  furniture.sofa(v, 3, 1, 10, 5, 'green')
  furniture.tv(v, 5, 1, 4)
  furniture.shelf(v, 2, 1, 14, 4, 3, 'x')
  furniture.table(v, 14, 1, 5, 4, 3, 'woodDark')
  for (const [x, z] of [
    [13, 6],
    [18, 6],
    [15, 4],
    [16, 8],
  ])
    furniture.chair(v, x, 1, z)
  for (let s = 0; s < 5; s++) for (let w = 0; w < 3; w++) v.set(15 + w, 1 + s, 15 - s, 'woodDark')
  // Upstairs: two bedrooms and a bathroom.
  v.box(11, 7, r.z0 + 1, 11, 11, r.z1 - 1, (_x, y, z) => (z >= 9 && z <= 10 && y <= 10 ? null : 'cream'))
  v.box(r.x0 + 1, 7, 10, 10, 11, 10, (x, y) => (x >= 5 && x <= 6 && y <= 10 ? null : 'cream'))
  furniture.bed(v, 3, 7, 5, 'blue')
  furniture.bed(v, 7, 7, 5, 'red')
  furniture.shelf(v, 2, 7, 14, 3, 2)
  furniture.bed(v, 14, 7, 5, 'purple')
  furniture.plant(v, 19, 7, 4)
  furniture.bath(v, 4, 7, 13)
  v.box(r.x0, 12, r.z0, r.x1, 12, r.z1, 'woodDark')
  gableRoof(v, r.x0, r.z0, r.x1, r.z1, 13, 'roof', 'roofDark', 'brick')
  for (const [x, z] of [
    [4, 8],
    [8, 9],
    [16, 8],
  ])
    furniture.crate(v, x, 13, z)
  chimney(v, 17, 7, 1, 21)
  return v.done()
}

// Corner shop: a shopfront with big windows, a striped awning and a sign;
// aisles of goods, fridges and a till inside; a flat above; a water tank
// on the roof.
function cornerShop(): Blueprint {
  const v = new Voxels(23, 19, 21)
  const r = { x0: 1, z0: 2, x1: 21, z1: 19 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, (x, _y, z) => ((x + z) % 2 === 0 ? 'tile' : 'white'))
  // Shop floor: glass front and side.
  v.ring(r.x0, 1, r.z0, r.x1, 5, r.z1, (x, y, z) => {
    const front = z === r.z0
    const side = x === r.x1
    if ((front || side) && y <= 4 && !((x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1))) {
      const u = front ? x : z
      return u % 5 === 0 ? 'green' : 'glass'
    }
    return y === 5 ? 'green' : 'brickLight'
  })
  door(v, 'front', 9, r.z0, 1, 3, 4, 'glassDark', 'green')
  // Sign band and awning.
  v.box(r.x0, 6, r.z0, r.x1, 7, r.z0, (x) => (x % 3 === 0 ? 'yellow' : 'green'))
  v.box(r.x1, 6, r.z0, r.x1, 7, r.z1, (_x, _y, z) => (z % 3 === 0 ? 'yellow' : 'green'))
  v.box(r.x0, 5, 0, r.x1, 5, 1, (x) => (x % 2 === 0 ? 'red' : 'white'))
  // Aisles of goods.
  for (const z of [7, 11, 15]) {
    furniture.shelf(v, 4, 1, z, 3, 8, 'x', ['red', 'yellow', 'orange', 'blue', 'pink', 'green'])
    furniture.shelf(v, 4, 1, z + 1, 3, 8, 'x', ['blue', 'green', 'red', 'yellow'])
  }
  // Fridges along the back, till at the front.
  for (let x = 3; x <= 18; x++) v.box(x, 1, 18, x, 4, 18, (_x, y) => (y === 4 ? 'white' : x % 3 === 0 ? 'steel' : 'glass'))
  furniture.counter(v, 15, 1, 5, 5, 'x', 'trim', 'wood')
  v.set(16, 3, 5, 'black') // till
  furniture.counter(v, 19, 1, 6, 4, 'z', 'trim', 'wood')
  // Flat upstairs.
  v.box(r.x0, 8, r.z0, r.x1, 8, r.z1, 'wood')
  storey(v, r, 9, 5, () => 'brickLight', { step: 4, w: 2, sill: 1, h: 3, offset: 2 })
  v.box(11, 9, r.z0 + 1, 11, 13, r.z1 - 1, (_x, y, z) => (z >= 9 && z <= 10 && y <= 12 ? null : 'cream'))
  furniture.bed(v, 4, 9, 6, 'green')
  furniture.sofa(v, 13, 9, 13, 4, 'orange')
  furniture.tv(v, 14, 9, 17)
  furniture.table(v, 16, 9, 5, 2, 2)
  furniture.shelf(v, 3, 9, 15, 3, 3)
  v.box(r.x0, 14, r.z0, r.x1, 14, r.z1, 'roof')
  v.ring(r.x0, 15, r.z0, r.x1, 15, r.z1, 'trim')
  // Water tank on legs.
  v.box(14, 15, 12, 14, 15, 12, 'woodDark')
  v.box(17, 15, 15, 17, 15, 15, 'woodDark')
  v.box(14, 16, 12, 17, 18, 15, (_x, y) => (y === 18 ? 'roofDark' : 'wood'))
  return v.done()
}

// Townhouses: a row of three tall narrow houses in different bricks, each
// with a stoop, a bay window, stairs up through three floors of rooms and
// a dormer in its roof.
function townhouses(): Blueprint {
  const v = new Voxels(35, 25, 19)
  const W = 11
  const bricks: [C, C][] = [
    ['brick', 'brickDark'],
    ['cream', 'stone'],
    ['brickLight', 'brick'],
  ]
  const sheets: C[] = ['blue', 'pink', 'green']
  for (let h = 0; h < 3; h++) {
    const x0 = 1 + h * W
    const r = { x0, z0: 2, x1: x0 + W, z1: 17 }
    const [a, b] = bricks[h]
    const wall = (x: number, y: number): C => ((x + y) % 5 === 0 ? b : a)
    v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'woodDark')
    for (let f = 0; f < 3; f++) {
      const y = 1 + f * 5
      storey(v, r, y, 4, wall, { step: 4, w: 2, sill: 1, h: 2, offset: 2 })
      if (f > 0) v.box(r.x0, y - 1, r.z0, r.x1, y - 1, r.z1, (x, _y, z) => (x >= x0 + 2 && x <= x0 + 3 && z >= 11 && z <= 15 ? null : 'wood'))
      v.ring(r.x0, y + 4, r.z0, r.x1, y + 4, r.z1, 'trim')
      // Stairs up the back.
      if (f < 2) for (let s = 0; s < 5; s++) v.box(x0 + 2, y + s, 15 - s, x0 + 3, y + s, 15 - s, 'woodDark')
      // Rooms: a bed or a sofa and a table each floor.
      if (f === 0) {
        furniture.sofa(v, x0 + 5, y, 9, 4, sheets[h])
        furniture.tv(v, x0 + 6, y, 4)
        furniture.plant(v, x0 + 9, y, 15)
      } else {
        furniture.bed(v, x0 + 6, y, 5 + f, sheets[(h + f) % 3])
        furniture.shelf(v, x0 + 9, y, 13, 3, 1, 'z')
        furniture.table(v, x0 + 5, y, 12, 2, 2)
      }
    }
    // Stoop and door.
    v.box(x0 + 2, 0, 0, x0 + 5, 1, 1, 'concrete')
    door(v, 'front', x0 + 3, r.z0, 1, 2, 4, (['navy', 'red', 'green'] as C[])[h])
    // Bay window out front on the first floor.
    v.box(x0 + 6, 6, 1, x0 + 9, 9, 1, (_x, y) => (y === 6 || y === 9 ? 'trim' : 'glass'))
    // Roof and dormer.
    v.box(r.x0, 15, r.z0, r.x1, 15, r.z1, 'woodDark')
    gableRoof(v, r.x0, r.z0, r.x1, r.z1, 16, 'roof', 'roofDark', a)
    v.box(x0 + 4, 16, 2, x0 + 7, 19, 4, (x, y, z) => (z === 2 && y <= 18 && x >= x0 + 5 && x <= x0 + 6 ? 'glass' : y === 19 ? 'roofDark' : 'trim'))
    chimney(v, x0 + 9, 11, 16, 23)
  }
  return v.done()
}

// School: two floors of brick classrooms (rows of desks, blackboards),
// a hall down the middle, a gym with court lines, a clock tower over the
// entrance and a flagpole.
function school(): Blueprint {
  const v = new Voxels(37, 31, 31)
  const r = { x0: 1, z0: 3, x1: 35, z1: 29 }
  const wall = (x: number, y: number): C => (y % 5 === 0 ? 'trim' : (x + y) % 6 === 0 ? 'brickDark' : 'brick')
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, (x, _y, z) => (x >= 24 && z >= 14 ? 'wood' : 'tile'))
  storey(v, r, 1, 5, wall, { step: 5, w: 3, sill: 2, h: 2, frame: 'brickLight' })
  v.box(r.x0, 6, r.z0, r.x1, 6, r.z1, (x, _y, z) => (x >= 24 && z >= 14 ? undefined : 'tile'))
  storey(v, r, 7, 5, wall, { step: 5, w: 3, sill: 1, h: 3, frame: 'brickLight' })
  v.box(r.x0, 12, r.z0, r.x1, 12, r.z1, 'roof')
  v.ring(r.x0, 13, r.z0, r.x1, 13, r.z1, 'trim')
  // Entrance with steps and the clock tower above it.
  v.box(14, 0, 0, 22, 1, 2, 'concrete')
  door(v, 'front', 16, r.z0, 1, 5, 4, 'glassDark')
  v.ring(15, 13, 3, 21, 24, 9, (x, y, z) => (z === 3 && y >= 18 && y <= 22 && x >= 16 && x <= 20 ? (Math.hypot(x - 18, y - 20) < 1.2 ? 'black' : 'white') : y === 24 ? 'trim' : 'brick'))
  v.set(18, 21, 3, 'gold')
  v.set(18, 20, 3, 'black')
  for (let k = 0; k < 5; k++) v.box(15 + k, 25 + k, 3 + k, 21 - k, 25 + k, 9 - k, k % 2 ? 'roofDark' : 'roof')
  // Flagpole.
  v.box(1, 1, 0, 1, 18, 0, 'steel')
  v.box(2, 15, 0, 5, 17, 0, (x, y) => ((x + y) % 2 === 0 ? 'blue' : 'white'))
  // Hall walls (z 13 & 17) with doors into each classroom.
  for (const zw of [13, 17])
    for (const y0 of [1, 7]) v.box(r.x0 + 1, y0, zw, 23, y0 + 4, zw, (x, y) => (x % 7 === 3 && y <= y0 + 3 ? null : 'cream'))
  for (const y0 of [1, 7])
    for (const xw of [8, 16]) {
      v.box(xw, y0, r.z0 + 1, xw, y0 + 4, 12, 'cream')
      v.box(xw, y0, 18, xw, y0 + 4, r.z1 - 1, 'cream')
    }
  // Classrooms: desks in rows facing a blackboard.
  for (const y0 of [1, 7])
    for (const [cx, cz, back] of [
      [2, 4, 12],
      [9, 4, 12],
      [17, 4, 12],
      [2, 18, 28],
      [9, 18, 28],
      [17, 18, 28],
    ] as [number, number, number][]) {
      v.box(cx + 1, y0 + 1, back, cx + 4, y0 + 2, back, 'green') // blackboard
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          const dx = cx + 1 + col * 2
          const dz = back - 3 - row * 2
          if (dz <= cz) continue
          v.set(dx, y0, dz, 'wood')
          v.set(dx, y0 + 1, dz, 'wood')
          v.set(dx, y0, dz + 1, 'orange')
        }
      v.set(cx + 5, y0, back - 1, 'woodDark') // teacher's desk
    }
  // Gym (back right, double height): court lines, hoops, benches.
  v.box(24, 1, 14, r.x1 - 1, 11, 14, (_x, y) => (y >= 6 ? 'cream' : undefined))
  v.box(24, 1, 14, 24, 11, r.z1 - 1, 'cream')
  v.box(24, 0, 14, r.x1 - 1, 0, r.z1 - 1, (x, _y, z) => (x === 29 || z === 21 || Math.hypot(x - 29.5, z - 21.5) < 2.5 ? 'white' : 'wood'))
  for (const z of [15, 28]) {
    v.box(29, 5, z, 30, 6, z, 'white')
    v.set(29, 4, z === 15 ? 16 : 27, 'orange')
  }
  furniture.counter(v, 25, 1, 16, 10, 'z', 'woodDark', 'woodDark')
  // Rooftop AC units.
  v.box(4, 13, 20, 7, 14, 23, (x) => (x % 2 ? 'steel' : 'steelDark'))
  v.box(27, 13, 6, 30, 14, 9, (x) => (x % 2 ? 'steel' : 'steelDark'))
  return v.done()
}

// ── City ───────────────────────────────────────────────────────────────

// Floors of a building: a slab under each (with a hole for the stairwell),
// walls with windows, and `fit` to furnish each floor.
function floors(
  v: Voxels,
  r: { x0: number; z0: number; x1: number; z1: number },
  o: {
    y0: number
    n: number
    h: number // floor to floor, slab included
    wall: (x: number, y: number, z: number) => C
    win: { step: number; w: number; sill: number; h: number; offset?: number; frame?: C; glass?: C } | null
    slab: C
    hole?: { x0: number; z0: number; x1: number; z1: number }
    fit?: (y: number, f: number) => void
  }
) {
  for (let f = 0; f < o.n; f++) {
    const y = o.y0 + f * o.h
    const hole = f > 0 ? o.hole : undefined
    v.box(r.x0, y, r.z0, r.x1, y, r.z1, (x, _y, z) => (hole && x >= hole.x0 && x <= hole.x1 && z >= hole.z0 && z <= hole.z1 ? null : o.slab))
    storey(v, r, y + 1, o.h - 1, o.wall, o.win)
    o.fit?.(y + 1, f)
  }
  return o.y0 + o.n * o.h // the roof's height
}

// A stairwell up through every floor (two bricks wide, switching back).
function stairwell(v: Voxels, x: number, z: number, y0: number, n: number, h: number) {
  for (let f = 0; f < n - 1; f++) {
    const y = y0 + f * h + 1
    for (let s = 0; s < h; s++) {
      const back = f % 2 === 1
      v.box(x, y + s, z + (back ? h - 1 - s : s), x + 1, y + s, z + (back ? h - 1 - s : s), 'concreteDark')
    }
  }
}

// Warehouse: ribbed steel over a concrete base, one roller door up with a
// forklift inside, rows of pallet racks, a site office, skylights.
function warehouse(): Blueprint {
  const v = new Voxels(37, 17, 29)
  const r = { x0: 1, z0: 1, x1: 35, z1: 27 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, (x, _y, z) => (x % 8 === 0 || z === 6 ? 'yellow' : 'concreteDark'))
  v.ring(r.x0, 1, r.z0, r.x1, 11, r.z1, (x, y, z) => {
    if (y <= 2) return 'concrete'
    if (y === 9) return (z === r.z0 ? x : z) % 3 === 0 ? 'steelDark' : 'glass'
    return (z === r.z0 || z === r.z1 ? x : z) % 2 === 0 ? 'steel' : 'steelDark'
  })
  // Roller doors: the left one open.
  for (const [x0, open] of [
    [4, true],
    [14, false],
  ] as [number, boolean][])
    for (let x = x0; x <= x0 + 7; x++)
      for (let y = 1; y <= 7; y++) v.set(x, y, r.z0, x === x0 || x === x0 + 7 || y === 7 ? 'yellow' : open && y <= 6 ? null : y % 2 ? 'steel' : 'steelDark')
  v.box(24, 9, r.z0, 32, 10, r.z0, (x) => (x % 2 ? 'blue' : 'white'))
  // Racks: uprights and three levels of pallets with goods.
  for (const z of [10, 16, 22])
    for (let x = 4; x <= 30; x++) {
      const upright = x % 6 === 4
      for (let y = 1; y <= 8; y++) {
        if (upright) v.set(x, y, z, 'orange')
        else if (y % 3 === 0) v.set(x, y, z, 'steelDark')
        else if (y % 3 === 1 && (x * 7 + z + y) % 5 !== 0) v.set(x, y, z, (['wood', 'cream', 'blue', 'red'] as C[])[(x + y + z) % 4])
      }
    }
  // Forklift in the open door with a pallet up.
  v.box(6, 1, 4, 8, 2, 6, 'yellow')
  v.box(6, 3, 6, 8, 4, 6, 'black')
  v.box(6, 1, 2, 6, 4, 3, 'steelDark')
  v.box(8, 1, 2, 8, 4, 3, 'steelDark')
  v.box(6, 3, 1, 8, 4, 3, 'wood')
  // Site office in the back corner.
  v.ring(27, 1, 22, 34, 5, 26, (x, y, z) => (y >= 2 && y <= 3 && (z === 22 || x === 27) && (x + z) % 3 ? 'glass' : 'white'))
  v.box(27, 6, 22, 34, 6, 26, 'steelDark')
  furniture.table(v, 30, 1, 24, 3, 1, 'wood')
  v.set(31, 3, 24, 'black')
  // Roof with skylight strips and vents.
  v.box(r.x0, 12, r.z0, r.x1, 12, r.z1, (x) => (x % 7 === 3 ? 'glass' : 'roofDark'))
  v.ring(r.x0, 13, r.z0, r.x1, 13, r.z1, 'steelDark')
  for (const x of [8, 20, 28]) v.box(x, 13, 12, x + 1, 15, 13, 'steel')
  return v.done()
}

// Apartments: seven floors around a central stairwell, flats either side
// of a corridor (beds, sofas, kitchens), balconies on the front, a water
// tower and dishes on the roof.
function apartments(): Blueprint {
  const v = new Voxels(31, 44, 25)
  const r = { x0: 1, z0: 2, x1: 29, z1: 23 }
  const cols: C[] = ['cream', 'cream', 'brickLight']
  const top = floors(v, r, {
    y0: 0,
    n: 7,
    h: 5,
    wall: (x, y) => (y % 5 === 0 ? 'trim' : cols[Math.floor(x / 5) % 3]),
    win: { step: 5, w: 2, sill: 1, h: 2 },
    slab: 'wood',
    hole: { x0: 14, z0: 13, x1: 15, z1: 17 },
    fit: (y, f) => {
      // Corridor walls with doors, the core in the middle.
      v.box(r.x0 + 1, y, 11, r.x1 - 1, y + 3, 11, (x, yy) => (x % 7 === 3 && yy <= y + 2 ? null : 'white'))
      v.box(r.x0 + 1, y, 18, r.x1 - 1, y + 3, 18, (x, yy) => (x % 7 === 3 && yy <= y + 2 ? null : 'white'))
      for (const x of [8, 22]) {
        v.box(x, y, r.z0 + 1, x, y + 3, 10, 'white')
        v.box(x, y, 19, x, y + 3, r.z1 - 1, 'white')
      }
      // Four flats a floor.
      const sheet: C[] = ['blue', 'pink', 'green', 'purple', 'orange']
      for (const [fx, fz, back] of [
        [2, 3, false],
        [23, 3, false],
        [2, 19, true],
        [23, 19, true],
      ] as [number, number, boolean][]) {
        furniture.bed(v, fx + 1, y, back ? fz + 1 : fz + 4, sheet[(f + fx) % 5])
        furniture.table(v, fx + 3, y, back ? fz + 1 : fz + 2, 2, 2)
      }
      furniture.sofa(v, 10, y, 4, 4, sheet[(f + 2) % 5])
      furniture.tv(v, 11, y, 9)
      furniture.counter(v, 16, y, 3, 5)
      furniture.sofa(v, 10, y, 20, 4, sheet[(f + 3) % 5])
      furniture.plant(v, 20, y, 21)
      // Balconies out front with a railing.
      if (f > 0)
        for (const bx of [3, 13, 23]) {
          v.box(bx, y - 1, 0, bx + 4, y - 1, 1, 'concrete')
          v.box(bx, y, 0, bx + 4, y, 0, 'steel')
        }
    },
  })
  stairwell(v, 14, 13, 0, 7, 5)
  door(v, 'front', 13, r.z0, 1, 3, 3, 'glassDark')
  v.box(r.x0, top, r.z0, r.x1, top, r.z1, 'roof')
  v.ring(r.x0, top + 1, r.z0, r.x1, top + 1, r.z1, 'trim')
  // Water tower and satellite dishes.
  for (const [x, z] of [
    [20, 15],
    [24, 19],
  ])
    v.box(x, top + 1, z, x, top + 2, z, 'woodDark')
  v.box(20, top + 3, 15, 24, top + 6, 19, (_x, y) => (y === top + 6 ? 'roofDark' : 'wood'))
  v.box(5, top + 1, 6, 6, top + 2, 6, 'white')
  v.box(9, top + 1, 6, 10, top + 2, 6, 'white')
  return v.done()
}

// Office tower: a glass curtain wall on a stone lobby, fourteen floors of
// desks with computers around a lift core, meeting rooms, a helipad and
// an antenna on top.
function officeTower(): Blueprint {
  const v = new Voxels(23, 62, 23)
  const r = { x0: 1, z0: 1, x1: 21, z1: 21 }
  // Lobby: double height, stone and dark glass, reception desk.
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, 'stone')
  v.ring(r.x0, 1, r.z0, r.x1, 7, r.z1, (x, y, z) => ((z === r.z0 || x === r.x1) && y <= 6 && (x + z) % 4 !== 0 ? 'glassDark' : 'stone'))
  door(v, 'front', 9, r.z0, 1, 4, 4, 'glass', 'gold')
  furniture.counter(v, 7, 1, 6, 8, 'x', 'stone', 'woodDark')
  furniture.plant(v, 3, 1, 3)
  furniture.plant(v, 19, 1, 3)
  const core = { x0: 9, z0: 9, x1: 13, z1: 13 }
  const top = floors(v, r, {
    y0: 8,
    n: 11,
    h: 4,
    wall: (x, y, z) => ((z === r.z0 || z === r.z1 ? x : z) % 4 === 1 || y % 4 === 0 ? 'concreteDark' : 'glass'),
    win: null,
    slab: 'concrete',
    fit: (y, f) => {
      // Desk rows with screens and chairs, a meeting table, plants.
      for (const dz of [3, 6, 15, 18])
        for (let dx = 3; dx <= 17; dx += 3) {
          if (dx >= 7 && dx <= 14 && dz >= 6 && dz <= 15) continue
          v.set(dx, y, dz, 'wood')
          v.set(dx + 1, y, dz, 'wood')
          v.set(dx, y + 1, dz, 'black')
          v.set(dx, y, dz + 1, (['blue', 'orange', 'green'] as C[])[(f + dx) % 3])
        }
      furniture.table(v, 16, y, 9, 3, 3, 'woodDark')
      furniture.plant(v, 3, y, 11)
      furniture.plant(v, 19, y, 2)
    },
  })
  // Lift core all the way up.
  v.ring(core.x0, 8, core.z0, core.x1, top - 1, core.z1, (x, y, z) => (z === core.z0 && x >= 10 && x <= 12 && y % 4 !== 0 ? 'steel' : 'concreteDark'))
  // Crown, helipad and antenna.
  v.box(r.x0, top, r.z0, r.x1, top, r.z1, 'roofDark')
  v.ring(r.x0, top + 1, r.z0, r.x1, top + 2, r.z1, 'steel')
  v.box(4, top + 1, 4, 18, top + 1, 18, (x, _y, z) => {
    const d = Math.max(Math.abs(x - 11), Math.abs(z - 11))
    const H = (Math.abs(x - 11) === 3 && Math.abs(z - 11) <= 3) || (z === 11 && Math.abs(x - 11) <= 3)
    return H ? 'white' : d === 7 ? 'yellow' : 'concreteDark'
  })
  v.box(19, top + 1, 19, 19, top + 8, 19, (_x, y) => (y === top + 8 ? 'red' : 'steelDark'))
  return v.done()
}

// Hotel: a white tower with balconies and a tall red sign, a lobby with a
// gold chandelier, eleven floors of rooms off a corridor, a rooftop pool
// with loungers and umbrellas.
function hotel(): Blueprint {
  const v = new Voxels(33, 48, 27)
  const r = { x0: 2, z0: 2, x1: 31, z1: 25 }
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, (x, _y, z) => ((x + z) % 2 ? 'carpet' : 'gold'))
  v.ring(r.x0, 1, r.z0, r.x1, 6, r.z1, (x, y, z) => ((z === r.z0 || x === r.x1) && y <= 5 && (x + z) % 5 ? 'glass' : 'stone'))
  door(v, 'front', 15, r.z0, 1, 5, 4, 'glassDark', 'gold')
  v.box(12, 6, 0, 23, 6, 1, 'red') // canopy
  for (const x of [12, 23]) v.box(x, 1, 0, x, 5, 0, 'gold')
  v.box(15, 4, 12, 20, 5, 17, (x, y, z) => (y === 5 || (x + z) % 2 ? 'gold' : undefined)) // chandelier
  furniture.counter(v, 20, 1, 19, 9, 'x', 'stone', 'woodDark')
  furniture.sofa(v, 5, 1, 8, 5, 'purple')
  furniture.sofa(v, 5, 1, 16, 5, 'purple')
  furniture.table(v, 6, 1, 12, 3, 2, 'gold')
  const top = floors(v, r, {
    y0: 7,
    n: 8,
    h: 4,
    wall: (x, y) => (y % 4 === 3 ? 'stone' : x % 6 === 2 ? 'cream' : 'white'),
    win: { step: 6, w: 3, sill: 1, h: 2, offset: 2, frame: 'stone' },
    slab: 'carpet',
    fit: (y, f) => {
      for (const zw of [11, 16]) v.box(r.x0 + 1, y, zw, r.x1 - 1, y + 2, zw, (x) => (x % 6 === 4 ? null : 'cream'))
      for (let x = 7; x < r.x1; x += 6) {
        v.box(x, y, r.z0 + 1, x, y + 2, 10, 'cream')
        v.box(x, y, 17, x, y + 2, r.z1 - 1, 'cream')
      }
      const sheet: C[] = ['white', 'blue', 'cream']
      for (let x = 3; x < r.x1 - 3; x += 6) {
        furniture.bed(v, x + 1, y, 5, sheet[f % 3])
        furniture.tv(v, x + 1, y, 10)
        furniture.bed(v, x + 1, y, 20, sheet[(f + 1) % 3])
        furniture.plant(v, x + 4, y, 23)
      }
      // Balconies.
      for (let x = 4; x < r.x1 - 2; x += 6) {
        v.box(x, y - 1, 0, x + 3, y - 1, 1, 'white')
        v.box(x, y, 0, x + 3, y, 0, 'glass')
      }
    },
  })
  v.box(r.x0, top, r.z0, r.x1, top, r.z1, 'tile')
  v.ring(r.x0, top + 1, r.z0, r.x1, top + 1, r.z1, 'glass')
  // Rooftop pool, loungers, umbrellas, bar.
  v.box(6, top, 6, 22, top, 18, 'water')
  v.ring(5, top, 5, 23, top, 19, 'white')
  for (let x = 7; x <= 21; x += 3) v.box(x, top + 1, 20, x + 1, top + 1, 21, 'white')
  for (const [x, z] of [
    [8, 23],
    [18, 23],
  ]) {
    v.box(x, top + 1, z, x, top + 3, z, 'white')
    v.box(x - 1, top + 4, z - 1, x + 1, top + 4, z + 1, (xx, _y, zz) => ((xx + zz) % 2 ? 'red' : 'white'))
  }
  furniture.counter(v, 26, top + 1, 7, 8, 'z', 'woodDark', 'wood')
  // The tall HOTEL sign up the right side.
  v.box(r.x1 + 1, 12, 4, r.x1 + 1, top - 2, 6, (_x, y) => (y % 6 === 0 ? 'gold' : 'red'))
  return v.done()
}

// Shopping mall: two floors of shops around a glass-roofed atrium with
// escalators and a fountain, a food court upstairs, a parking deck sign.
function mall(): Blueprint {
  const v = new Voxels(45, 30, 39)
  const r = { x0: 1, z0: 3, x1: 43, z1: 37 }
  const atrium = { x0: 15, z0: 13, x1: 29, z1: 27 }
  const inAtrium = (x: number, z: number) => x >= atrium.x0 && x <= atrium.x1 && z >= atrium.z0 && z <= atrium.z1
  v.box(r.x0, 0, r.z0, r.x1, 0, r.z1, (x, _y, z) => ((x + z) % 4 === 0 ? 'white' : 'tile'))
  v.box(r.x0, 0, 0, r.x1, 0, 2, (x) => (x % 4 === 0 ? 'white' : 'concreteDark')) // plaza
  for (let f = 0; f < 2; f++) {
    const y = 1 + f * 7
    if (f > 0) v.box(r.x0, y - 1, r.z0, r.x1, y - 1, r.z1, (x, _y, z) => (inAtrium(x, z) ? null : 'tile'))
    v.ring(r.x0, y, r.z0, r.x1, y + 5, r.z1, (x, yy, z) => {
      const face = z === r.z0 || x === r.x1
      if (face && yy - y <= 3) return (z === r.z0 ? x : z) % 6 === 0 ? 'white' : 'glass'
      if (yy - y === 5) return 'trim'
      return face && yy - y === 4 ? ((z === r.z0 ? x : z) % 2 ? 'blue' : 'navy') : 'white'
    })
    // Shops round the atrium: walls between them, glass fronts, goods.
    const colors: C[] = ['red', 'blue', 'green', 'pink', 'orange', 'purple', 'yellow']
    for (let x = r.x0 + 7; x < r.x1; x += 7) {
      v.box(x, y, r.z0 + 1, x, y + 4, atrium.z0 - 2, 'white')
      v.box(x, y, atrium.z1 + 2, x, y + 4, r.z1 - 1, 'white')
    }
    for (let x = r.x0 + 1; x < r.x1; x++) {
      v.box(x, y, atrium.z0 - 2, x, y + 4, atrium.z0 - 2, x % 7 === 4 ? null : x % 7 === 0 ? 'white' : 'glass')
      v.box(x, y, atrium.z1 + 2, x, y + 4, atrium.z1 + 2, x % 7 === 4 ? null : x % 7 === 0 ? 'white' : 'glass')
    }
    for (let x = r.x0 + 2; x < r.x1 - 2; x += 7) {
      const c = colors[(x + f * 3) % colors.length]
      furniture.shelf(v, x, y, r.z0 + 2, 3, 4, 'x', [c, 'white', c])
      furniture.counter(v, x + 1, y, atrium.z0 - 5, 3, 'x', c, 'white')
      furniture.shelf(v, x, y, r.z1 - 2, 3, 4, 'x', [c, 'yellow', c])
    }
    if (f === 1)
      for (let x = 3; x < 13; x += 3)
        for (const z of [16, 21]) {
          furniture.table(v, x, y, z, 2, 2, 'white')
          v.set(x - 1, y, z, 'red')
        }
  }
  // Atrium: fountain, escalators, glass roof.
  v.ring(20, 1, 18, 24, 1, 22, 'stone')
  v.box(21, 1, 19, 23, 1, 21, 'water')
  v.box(22, 2, 20, 22, 4, 20, 'white')
  for (let s = 0; s < 7; s++) {
    v.box(16 + s, 1 + s, 14, 16 + s, 1 + s, 15, 'steelDark')
    v.box(28 - s, 1 + s, 25, 28 - s, 1 + s, 26, 'steelDark')
  }
  v.box(r.x0, 14, r.z0, r.x1, 14, r.z1, (x, _y, z) => (inAtrium(x, z) ? null : 'roof'))
  for (let k = 0; k < 6; k++)
    v.ring(atrium.x0 + k, 14 + k, atrium.z0 + k, atrium.x1 - k, 14 + k, atrium.z1 - k, (x, _y, z) => ((x + z) % 3 ? 'glass' : 'steel'))
  // Big sign and a pylon.
  v.box(14, 12, 2, 30, 13, 2, (x) => (x % 2 ? 'gold' : 'red'))
  v.box(2, 1, 0, 3, 24, 1, (_x, y) => (y >= 18 ? (y % 2 ? 'red' : 'yellow') : 'navy'))
  // AC units.
  for (const [x, z] of [
    [5, 8],
    [36, 8],
    [36, 30],
    [5, 30],
  ])
    v.box(x, 15, z, x + 3, 16, z + 2, (xx) => (xx % 2 ? 'steel' : 'steelDark'))
  return v.done()
}

// Hospital: white wards on six floors with beds and blue curtains, a red
// cross, an ambulance bay with an ambulance, a helipad on the roof.
function hospital(): Blueprint {
  const v = new Voxels(43, 35, 33)
  const r = { x0: 1, z0: 4, x1: 41, z1: 31 }
  v.box(r.x0, 0, 0, r.x1, 0, r.z1, (x, _y, z) => (z < r.z0 ? (x % 4 === 0 ? 'yellow' : 'concreteDark') : 'tile'))
  const top = floors(v, r, {
    y0: 0,
    n: 5,
    h: 5,
    wall: (x, y) => (y % 5 === 0 ? 'blue' : x % 8 === 0 ? 'cream' : 'white'),
    win: { step: 4, w: 2, sill: 1, h: 2, frame: 'white', glass: 'glass' },
    slab: 'tile',
    hole: { x0: 19, z0: 22, x1: 20, z1: 26 },
    fit: (y, f) => {
      if (f === 0) {
        furniture.counter(v, 14, y, 9, 12, 'x', 'white', 'blue')
        for (let x = 4; x <= 34; x += 5) furniture.sofa(v, x, y, 14, 3, 'blue')
        return
      }
      v.box(r.x0 + 1, y, 16, r.x1 - 1, y + 3, 16, (x, yy) => (x % 8 === 4 && yy <= y + 2 ? null : 'white'))
      for (let x = 3; x <= 37; x += 4)
        for (const [z, back] of [
          [7, false],
          [24, true],
        ] as [number, boolean][]) {
          furniture.bed(v, x, y, back ? z + 1 : z, 'white')
          v.box(x + 2, y, back ? z - 1 : z - 1, x + 2, y + 2, back ? z + 3 : z + 3, 'blue') // curtain
        }
    },
  })
  stairwell(v, 19, 22, 0, 5, 5)
  door(v, 'front', 18, r.z0, 1, 5, 3, 'glass', 'blue')
  // Ambulance bay with an ambulance.
  v.box(28, 4, 0, 40, 4, 3, 'white')
  for (const x of [28, 40]) v.box(x, 1, 0, x, 3, 0, 'steel')
  v.box(31, 1, 0, 35, 3, 3, (x, y) => (y === 2 && x >= 32 && x <= 34 ? 'red' : 'white'))
  v.set(31, 1, 0, 'black')
  v.set(35, 1, 0, 'black')
  v.box(32, 3, 0, 33, 3, 0, 'glassDark')
  // Red cross on the front and the right side.
  for (const [cx, cy] of [[10, 22]] as [number, number][])
    v.box(cx - 3, cy - 3, r.z0 - 1, cx + 3, cy + 3, r.z0 - 1, (x, y) => (Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1 ? 'red' : undefined))
  v.box(r.x1 + 1, 19, 14, r.x1 + 1, 25, 20, (_x, y, z) => (Math.abs(z - 17) <= 1 || Math.abs(y - 22) <= 1 ? 'red' : undefined))
  v.box(r.x0, top, r.z0, r.x1, top, r.z1, 'roof')
  v.ring(r.x0, top + 1, r.z0, r.x1, top + 1, r.z1, 'white')
  // Helipad.
  v.box(14, top + 1, 9, 28, top + 1, 23, (x, _y, z) => {
    const d = Math.hypot(x - 21, z - 16)
    const H = (Math.abs(x - 21) === 3 && Math.abs(z - 16) <= 3) || (z === 16 && Math.abs(x - 21) <= 3)
    return d > 7.5 ? undefined : H ? 'white' : d > 6.5 ? 'red' : 'concreteDark'
  })
  return v.done()
}

// Stadium (harbour): a bowl of team-coloured seats, a striped pitch with
// goals, concourses under the stands with food stalls, a roof canopy, a
// scoreboard and four floodlight masts.
function stadium(): Blueprint {
  const v = new Voxels(47, 34, 41)
  const cx = 23
  const cz = 20
  const pitch = (x: number, z: number) => Math.abs(x - cx) <= 11 && Math.abs(z - cz) <= 7
  for (let x = 0; x < 47; x++)
    for (let z = 0; z < 41; z++) {
      const e = Math.hypot((x - cx) / 22.5, (z - cz) / 19.5)
      if (e > 1) continue
      const inner = Math.hypot((x - cx) / 13, (z - cz) / 9.5)
      if (inner <= 1) {
        // Pitch: stripes, lines, centre circle.
        const line = pitch(x, z) && (Math.abs(x - cx) === 11 || Math.abs(z - cz) === 7 || x === cx || Math.abs(Math.hypot(x - cx, z - cz) - 3) < 0.5)
        v.set(x, 0, z, line ? 'white' : Math.floor(x / 2) % 2 ? 'grass' : 'green')
        continue
      }
      // Stands rise outward in steps; each step a seat row.
      const t = (Math.min(1, e) - 0.55) / 0.45
      const rows = Math.max(1, Math.round(t * 16))
      for (let y = 0; y <= rows; y++) {
        if (y < rows) {
          // Concourse inside the lower stand: hollow with stalls.
          if (y >= 1 && y <= 4 && rows > 8 && e > 0.75 && e < 0.95) continue
          v.set(x, y, z, 'concrete')
        } else v.set(x, y, z, (Math.atan2(z - cz, x - cx) * 6) % 2 > 1 || Math.abs(x - cx) < 1 ? 'white' : rows % 2 ? 'red' : 'blue')
      }
      // Outer facade.
      if (e > 0.96) for (let y = 1; y <= 18; y++) v.set(x, y, z, y % 6 === 0 ? 'red' : y % 6 === 3 ? 'glass' : 'white')
    }
  // Food stalls in the concourse.
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2
    const x = Math.round(cx + Math.cos(ang) * 19)
    const z = Math.round(cz + Math.sin(ang) * 16.5)
    v.box(x, 1, z, x, 2, z, (['red', 'yellow', 'orange', 'green'] as C[])[a % 4])
  }
  // Goals.
  for (const gx of [cx - 11, cx + 11]) v.box(gx, 1, cz - 2, gx, 2, cz + 2, (_x, y, z) => (y === 2 || Math.abs(z - cz) === 2 ? 'white' : undefined))
  // Roof canopy over the stands (a ring).
  for (let x = 0; x < 47; x++)
    for (let z = 0; z < 41; z++) {
      const e = Math.hypot((x - cx) / 22.5, (z - cz) / 19.5)
      if (e <= 1 && e > 0.8) v.set(x, 19, z, (x + z) % 2 ? 'steel' : 'white')
    }
  // Scoreboard and floodlights.
  v.box(17, 20, 1, 29, 25, 2, (x, y) => (y === 20 || y === 25 || x === 17 || x === 29 ? 'black' : (x + y) % 3 ? 'navy' : 'yellow'))
  for (const [px, pz] of [
    [4, 4],
    [42, 4],
    [4, 36],
    [42, 36],
  ]) {
    v.box(px, 1, pz, px, 30, pz, 'steelDark')
    v.box(px - 1, 30, pz - 1, px + 1, 32, pz + 1, 'yellow')
  }
  return v.done()
}

// Cruise ship (harbour): a navy and red hull, white decks of cabins with
// balconies (beds inside), a pool deck with a slide, red funnels and
// orange lifeboats.
function cruiseShip(): Blueprint {
  const v = new Voxels(47, 40, 21)
  const cz = 10
  const hullHalf = (x: number) => (x < 8 ? Math.max(1, 9 * (x / 8)) : x > 42 ? 9 * ((46 - x) / 4) : 9)
  for (let x = 0; x < 47; x++) {
    const h = hullHalf(x)
    for (let z = 0; z < 21; z++) {
      if (Math.abs(z - cz) > h) continue
      for (let y = 0; y <= 9; y++) {
        // Bow and stern are solid; amidships is hollow with holds inside.
        const shell = Math.abs(z - cz) > h - 1.5 || y === 0 || x < 5 || x > 40
        if (!shell && y < 9) {
          // Engine room and holds inside the hull.
          if (y === 1 && x % 6 === 3 && Math.abs(z - cz) <= 3) v.set(x, y, z, 'steelDark')
          continue
        }
        v.set(x, y, z, y <= 2 ? 'red' : y === 9 ? 'wood' : y === 6 && (x + z) % 3 === 0 ? 'glass' : 'hull')
      }
    }
  }
  // Decks of cabins.
  for (let d = 0; d < 5; d++) {
    const y = 10 + d * 4
    const x0 = 6 + d * 2
    const x1 = 42 - d
    const half = 8 - (d > 2 ? 1 : 0)
    v.ring(x0, y, cz - half, x1, y + 3, cz + half, (x, yy, z) => (yy - y >= 1 && yy - y <= 2 && (x + z) % 3 ? 'glassDark' : 'white'))
    v.box(x0, y + 3, cz - half, x1, y + 3, cz + half, 'white')
    v.box(x0 + 1, y, cz - half + 1, x1 - 1, y, cz + half - 1, 'carpet')
    // Corridor and cabins with beds.
    v.box(x0 + 1, y, cz, x1 - 1, y + 2, cz, (x) => (x % 4 === 0 ? null : 'cream'))
    for (let x = x0 + 2; x < x1 - 2; x += 4) {
      furniture.bed(v, x, y + 1 - 1, cz - half + 2, 'white')
      furniture.bed(v, x, y + 1 - 1, cz + 2, 'blue')
    }
    // Balconies down the side facing the camera.
    v.box(x0, y, cz - half - 1, x1, y, cz - half - 1, (x) => (x % 2 ? 'white' : 'steel'))
  }
  // Pool deck on top: pool, slide, loungers.
  const yt = 30
  v.box(20, yt, 6, 32, yt, 14, 'wood')
  v.box(22, yt, 8, 30, yt, 12, 'water')
  for (let s = 0; s < 6; s++) v.box(34 - s, yt + 6 - s, 13 - (s % 2), 34 - s, yt + 6 - s, 13 - (s % 2), 'yellow')
  for (let x = 21; x <= 31; x += 2) v.set(x, yt + 1, 6, 'white')
  // Funnels.
  for (const fx of [14, 20]) v.box(fx, yt, 9, fx + 2, yt + 6, 11, (_x, y) => (y >= yt + 5 ? 'black' : 'red'))
  // Lifeboats along the side.
  for (let x = 9; x <= 37; x += 7) v.box(x, 13, 1, x + 3, 13, 1, 'orange')
  // Bridge windows at the bow end.
  v.box(36, 26, cz - 6, 37, 27, cz + 6, (_x, y) => (y === 27 ? 'white' : 'glassDark'))
  return v.done()
}

// ── Industrial island ──────────────────────────────────────────────────

// A round tank (cylinder) of radius rr at (cx, cz) from y0 to y1, a shell
// with a domed cap.
function tank(v: Voxels, cx: number, cz: number, rr: number, y0: number, y1: number, body: (y: number) => C, cap: C = 'steelDark') {
  for (let y = y0; y <= y1 + Math.ceil(rr / 2); y++) {
    const rad = y <= y1 ? rr : rr * Math.sqrt(Math.max(0, 1 - ((y - y1) / (rr / 2 + 0.5)) ** 2))
    for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++)
      for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++) {
        const d = Math.hypot(x - cx, z - cz)
        if (d > rad + 0.3) continue
        if (y <= y1 && d < rad - 0.7 && y !== y0) continue // hollow inside
        v.set(x, y, z, y > y1 ? cap : body(y))
      }
  }
}

// A chimney stack: round, striped near the top.
function stack(v: Voxels, cx: number, cz: number, rr: number, y0: number, y1: number) {
  tank(v, cx, cz, rr, y0, y1, (y) => (y > y1 - 6 ? (Math.floor(y / 2) % 2 ? 'red' : 'white') : 'brickDark'), 'black')
}

// Factory: a sawtooth-roofed hall with an assembly line inside (conveyor,
// robot arms, crates of parts), offices on a mezzanine, a brick stack.
function factory(): Blueprint {
  const v = new Voxels(43, 40, 35)
  const r = { x0: 1, z0: 3, x1: 41, z1: 33 }
  v.box(r.x0, 0, 0, r.x1, 0, r.z1, (x, _y, z) => (z < r.z0 ? 'concreteDark' : (x + z) % 9 === 0 ? 'yellow' : 'concrete'))
  v.ring(r.x0, 1, r.z0, r.x1, 10, r.z1, (x, y, z) => {
    if (y <= 2) return 'brickDark'
    if (y >= 5 && y <= 7 && (z === r.z0 ? x : z) % 4 !== 0) return 'glass'
    return y % 3 === 0 ? 'brick' : 'brickLight'
  })
  // Loading doors.
  for (const x0 of [5, 15])
    for (let x = x0; x <= x0 + 6; x++) for (let y = 1; y <= 4; y++) v.set(x, y, r.z0, x === x0 || x === x0 + 6 || y === 4 ? 'yellow' : null)
  v.box(26, 11, r.z0, 38, 12, r.z0, (x) => (x % 2 ? 'blue' : 'white'))
  // Assembly line: conveyor down the hall with robot arms and parts.
  v.box(4, 1, 17, 37, 1, 19, (x, _y, z) => (z === 18 ? (x % 2 ? 'black' : 'steelDark') : 'steel'))
  for (let x = 6; x <= 34; x += 7) {
    v.box(x, 2, 15, x, 4, 15, 'orange')
    v.box(x, 4, 16, x, 4, 17, 'orange')
    v.set(x, 3, 17, 'yellow')
    furniture.crate(v, x + 2, 2, 18, (['red', 'blue', 'green'] as C[])[x % 3])
  }
  for (let x = 4; x <= 37; x += 5) for (const z of [6, 28]) furniture.crate(v, x, 1, z, 'wood')
  // Mezzanine offices along the back with stairs.
  v.box(r.x0 + 1, 6, 24, r.x1 - 1, 6, r.z1 - 1, 'steelDark')
  v.box(r.x0 + 1, 7, 24, r.x1 - 1, 7, 24, 'steel')
  for (let x = 4; x <= 36; x += 8) {
    furniture.table(v, x, 7, 28, 3, 2, 'wood')
    v.set(x, 9, 28, 'black')
  }
  stairs(v, 34, 1, 18, 6, 'z', 2, 'steelDark')
  // Sawtooth roof.
  for (let k = 0; k < 6; k++) {
    const z0 = r.z0 + k * 5
    for (let s = 0; s < 5; s++)
      v.box(r.x0, 11 + s, z0 + s, r.x1, 11 + s, z0 + s, s === 4 ? 'glass' : s % 2 ? 'roofDark' : 'roof')
    v.box(r.x0, 11, z0 + 4, r.x1, 15, z0 + 4, (_x, y) => (y >= 12 && y <= 14 ? 'glass' : 'roofDark'))
  }
  v.box(r.x0, 11, r.z0, r.x0, 15, r.z1, 'brick')
  v.box(r.x1, 11, r.z0, r.x1, 15, r.z1, 'brick')
  stack(v, 37, 29, 2.5, 1, 36)
  return v.done()
}

// Power plant: a turbine hall (turbines and generators inside, a control
// room with screens), two cooling towers and a tall striped stack.
function powerPlant(): Blueprint {
  const v = new Voxels(45, 52, 37)
  v.box(0, 0, 0, 44, 0, 36, (x, _y, z) => ((x + z) % 7 === 0 ? 'yellow' : 'concreteDark'))
  // Turbine hall along the front.
  const r = { x0: 1, z0: 1, x1: 30, z1: 15 }
  v.ring(r.x0, 1, r.z0, r.x1, 13, r.z1, (x, y, z) => (y >= 8 && y <= 10 && (z === r.z0 ? x : z) % 3 ? 'glass' : y % 4 === 0 ? 'steelDark' : 'blue'))
  v.box(r.x0, 14, r.z0, r.x1, 14, r.z1, 'roofDark')
  door(v, 'front', 4, r.z0, 1, 4, 5, 'steel', 'yellow')
  // Turbines: long drums with generators.
  for (const z of [5, 11])
    for (let x = 4; x <= 27; x++) {
      const gen = x > 22
      v.box(x, 1, z - 1, x, 3, z + 1, gen ? 'red' : x % 3 ? 'steel' : 'steelDark')
    }
  // Gantry crane over them.
  v.box(r.x0 + 1, 11, 8, r.x1 - 1, 11, 8, 'yellow')
  v.box(14, 9, 8, 14, 10, 8, 'black')
  // Control room up front-right with screens and desks.
  v.box(r.x1 - 7, 6, r.z0 + 1, r.x1 - 1, 6, r.z0 + 5, 'tile')
  for (let x = r.x1 - 6; x <= r.x1 - 2; x += 2) {
    v.set(x, 7, r.z0 + 4, 'wood')
    v.set(x, 8, r.z0 + 5, (x % 4 ? 'green' : 'black') as C)
  }
  // Cooling towers (hyperbolic: narrow waist).
  for (const [cx, cz] of [
    [10, 27],
    [24, 27],
  ]) {
    for (let y = 1; y <= 34; y++) {
      const t = (y - 22) / 18
      const rad = 4.2 + 3 * t * t
      for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++)
        for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++) {
          const d = Math.hypot(x - cx, z - cz)
          if (d <= rad + 0.3 && d >= rad - 0.8) v.set(x, y, z, y > 30 ? 'red' : y % 6 === 0 ? 'concreteDark' : 'concrete')
        }
    }
    v.box(cx - 3, 1, cz - 3, cx + 3, 1, cz + 3, 'water')
  }
  // Boiler house and stack.
  v.ring(33, 1, 3, 43, 20, 13, (x, y, z) => (y % 5 === 0 ? 'steelDark' : (x + z) % 4 === 0 && y % 5 === 2 ? 'glass' : 'brick'))
  v.box(33, 21, 3, 43, 21, 13, 'roofDark')
  for (let y = 1; y <= 18; y += 5) v.box(34, y, 4, 42, y, 12, 'steelDark')
  tank(v, 38, 8, 2.5, 2, 14, () => 'orange')
  stack(v, 38, 25, 3, 1, 48)
  // Pylons and lines off the side.
  v.box(43, 1, 20, 43, 18, 20, 'steelDark')
  v.box(41, 16, 20, 44, 16, 20, 'steelDark')
  return v.done()
}

// Refinery: tank farm, distillation columns wrapped in walkways and
// pipes, a flare stack, pipe racks; a control building with consoles.
function refinery(): Blueprint {
  const v = new Voxels(45, 50, 37)
  v.box(0, 0, 0, 44, 0, 36, (x, _y, z) => ((x * 3 + z) % 11 === 0 ? 'yellow' : 'concreteDark'))
  // Tank farm at the back.
  for (const [cx, cz, rr] of [
    [7, 28, 5],
    [19, 28, 5],
    [31, 29, 4],
  ])
    tank(v, cx, cz, rr, 1, 9, (y) => (y === 5 ? 'red' : 'white'))
  // Distillation columns with platforms every few levels.
  for (const [cx, cz, h] of [
    [12, 12, 40],
    [20, 13, 32],
    [27, 11, 26],
  ]) {
    tank(v, cx, cz, 2, 1, h, (y) => (y % 8 === 0 ? 'yellow' : 'steel'), 'steelDark')
    for (let y = 8; y < h; y += 8) v.ring(cx - 3, y, cz - 3, cx + 3, y, cz + 3, 'yellow')
  }
  // Pipe rack across the site.
  for (let x = 2; x <= 40; x++) {
    if (x % 6 === 2) v.box(x, 1, 20, x, 6, 20, 'steelDark')
    v.set(x, 6, 20, 'steelDark')
    v.set(x, 7, 20, x % 2 ? 'orange' : 'green')
    v.set(x, 7, 21, 'blue')
  }
  // Control building with consoles.
  const r = { x0: 33, z0: 1, x1: 43, z1: 15 }
  v.ring(r.x0, 1, r.z0, r.x1, 6, r.z1, (x, y, z) => (y >= 3 && y <= 4 && (z === r.z0 ? x : z) % 3 ? 'glass' : 'white'))
  v.box(r.x0, 7, r.z0, r.x1, 7, r.z1, 'roofDark')
  door(v, 'front', 37, r.z0, 1, 2, 3, 'blue')
  for (let z = 4; z <= 12; z += 3) {
    furniture.counter(v, 36, 1, z, 5, 'x', 'black', 'steel')
    v.set(38, 3, z, 'green')
  }
  // Flare stack with a flame.
  tank(v, 3, 6, 1.5, 1, 44, (y) => (y > 40 ? 'red' : 'steelDark'), 'steelDark')
  v.box(2, 46, 5, 4, 48, 7, (_x, y) => (y === 48 ? 'yellow' : 'orange'))
  return v.done()
}

// Steel mill: blast furnaces with stoves and skip hoists, a rolling-mill
// shed with glowing slabs on rollers, ladles, ore and coke piles.
function steelMill(): Blueprint {
  const v = new Voxels(45, 56, 37)
  v.box(0, 0, 0, 44, 0, 36, (x, _y, z) => ((x + z * 2) % 9 === 0 ? 'yellow' : 'concreteDark'))
  // Rolling-mill shed along the front with slabs on rollers.
  const r = { x0: 1, z0: 1, x1: 43, z1: 13 }
  v.ring(r.x0, 1, r.z0, r.x1, 12, r.z1, (x, y, z) => (y >= 8 && y <= 9 && (z === r.z0 ? x : z) % 3 ? 'glass' : y % 4 === 0 ? 'steelDark' : 'blue'))
  v.box(r.x0, 13, r.z0, r.x1, 13, r.z1, (_x, _y, z) => (z % 3 === 0 ? 'roof' : 'roofDark'))
  door(v, 'front', 5, r.z0, 1, 5, 6, 'steel', 'yellow')
  for (let x = 3; x <= 41; x++) {
    v.set(x, 1, 7, x % 2 ? 'steelDark' : 'black')
    if (x % 9 < 5) v.set(x, 2, 7, x % 9 === 2 ? 'yellow' : 'orange')
  }
  // Ladles and an overhead crane.
  for (const x of [8, 30]) tank(v, x, 10, 1.5, 1, 3, () => 'black', 'orange')
  v.box(r.x0 + 1, 10, 7, r.x1 - 1, 10, 7, 'yellow')
  // Blast furnaces with stoves and skip hoists.
  for (const cx of [12, 28]) {
    tank(v, cx, 25, 4, 1, 30, (y) => (y < 6 ? 'brickDark' : y % 6 === 0 ? 'steelDark' : 'steel'), 'steelDark')
    v.box(cx - 1, 31, 24, cx + 1, 40, 26, (_x, y) => (y === 40 ? 'black' : 'steelDark'))
    for (const sz of [32, 18]) tank(v, cx + 6, sz, 1.8, 1, 26, () => 'concrete', 'roofDark')
    for (let s = 0; s < 22; s++) v.box(cx - 6 + Math.floor(s / 4), 1 + s, 31 - Math.floor(s / 6), cx - 5 + Math.floor(s / 4), 1 + s, 31 - Math.floor(s / 6), 'yellow')
    v.box(cx - 2, 2, 25, cx + 2, 3, 25, 'orange') // glow at the taphole
  }
  // Ore and coke piles.
  for (const [px, pz, c] of [
    [39, 22, 'brickDark'],
    [39, 31, 'black'],
  ] as [number, number, C][])
    for (let x = px - 5; x <= px + 5; x++)
      for (let z = pz - 4; z <= pz + 4; z++) {
        const h = Math.round(5 - Math.hypot(x - px, (z - pz) * 1.2))
        for (let y = 1; y <= h; y++) v.set(x, y, z, c)
      }
  stack(v, 3, 33, 2, 1, 50)
  return v.done()
}

export const HOUSE_DESIGNS = { shed, garage, cottage, oldHouse, cornerShop, townhouses, school }
export const CITY_DESIGNS = { warehouse, apartments, officeTower, hotel, mall, hospital, stadium, cruiseShip }
export const INDUSTRIAL_DESIGNS = { factory, powerPlant, refinery, steelMill }
