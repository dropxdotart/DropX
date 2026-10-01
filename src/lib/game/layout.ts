// World layout constants shared by the engine, routing and the 3D scene.
// Kept in their own module so engine.ts and roads.ts can both import them
// without a circular dependency.

export const BRICK = 0.33
export const LOT_HALF = 8
export const ROAD_Z = LOT_HALF + 3.5
export const DUMPSTER = { x: 0, z: LOT_HALF - 1.4 }
export const TRUCK_STOP = { x: 0, z: ROAD_Z - 0.6 }

// Up to three dumpsters per plot (each bought and upgraded on its own).
// The first sits front-centre; extras stand sideways along the left and
// right edges, turned so their logo side faces the camera. Each one's
// worker line starts just past its open end and runs along `dir`, wrapping
// into a second row by `wrap`.
export const MAX_DUMPSTERS = 3
export const DUMPSTER_SLOTS = [
  { x: 0, z: LOT_HALF - 1.4, rot: 0, line: { x: 2.3, z: LOT_HALF - 1.4 }, dir: { x: 0.7, z: 0 }, wrap: { x: 0, z: -0.75 } },
  { x: -7.1, z: 0.3, rot: Math.PI / 2, line: { x: -7.1, z: -2.1 }, dir: { x: 0, z: -0.7 }, wrap: { x: 0.75, z: 0 } },
  { x: 7.1, z: 0.3, rot: Math.PI / 2, line: { x: 7.1, z: -2.1 }, dir: { x: 0, z: -0.7 }, wrap: { x: -0.75, z: 0 } },
]
