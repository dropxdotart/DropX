// Daily goals and contracts. Goals are three small jobs a day (the same
// three for everyone on a given day, scaled to your level); clearing all
// three earns a bonus chest. A contract is a longer job — demolish a
// particular building a few times — for a bigger reward.

export type Counter = 'haul' | 'clear' | 'chest' | 'tool' | 'fix' | 'upgrade' | 'tap'
export type Counters = Record<Counter, number>
export const ZERO_COUNTERS: Counters = { haul: 0, clear: 0, chest: 0, tool: 0, fix: 0, upgrade: 0, tap: 0 }

export type Goal = { kind: Counter; target: number; text: string; gems: number }

const POOL: { kind: Counter; make: (level: number) => { target: number; text: (n: number) => string } }[] = [
  { kind: 'haul', make: (l) => ({ target: Math.round(300 * Math.pow(1.35, l - 1) / 50) * 50, text: (n) => `Haul ${n.toLocaleString()} bricks to the yard` }) },
  { kind: 'clear', make: (l) => ({ target: l < 5 ? 2 : 3, text: (n) => `Clear ${n} buildings` }) },
  { kind: 'chest', make: () => ({ target: 2, text: (n) => `Open ${n} chests` }) },
  { kind: 'tool', make: () => ({ target: 3, text: (n) => `Use the wrecking ball or dynamite ${n} times` }) },
  { kind: 'fix', make: () => ({ target: 2, text: (n) => `Fix ${n} problems on site (trucks, breaks, jams)` }) },
  { kind: 'upgrade', make: (l) => ({ target: l < 6 ? 3 : 5, text: (n) => `Buy ${n} upgrades` }) },
  { kind: 'tap', make: () => ({ target: 150, text: (n) => `Break ${n} bricks by hand` }) },
]

// A day as "YYYY-MM-DD" in the player's own time zone.
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// The day's three goals: picked from the pool by the date, sized by level.
export function dailyGoals(day: string, level: number): Goal[] {
  const order = POOL.map((p, i) => ({ p, k: hash(`${day}:${i}`) })).sort((a, b) => a.k - b.k)
  return order.slice(0, 3).map(({ p }, i) => {
    const g = p.make(level)
    return { kind: p.kind, target: g.target, text: g.text(g.target), gems: 5 + i * 3 }
  })
}

export type Contract = { building: string; target: number; base: number; chest: 'iron' | 'gold'; gems: number }
