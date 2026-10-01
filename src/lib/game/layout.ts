// World layout constants shared by the engine, routing and the 3D scene.
// Kept in their own module so engine.ts and roads.ts can both import them
// without a circular dependency.

export const BRICK = 0.33
export const LOT_HALF = 8
export const ROAD_Z = LOT_HALF + 3.5
export const DUMPSTER = { x: 0, z: LOT_HALF - 1.4 }
export const TRUCK_STOP = { x: 0, z: ROAD_Z - 0.6 }
