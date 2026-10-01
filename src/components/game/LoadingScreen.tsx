// First-load screen: white bricks drop in one by one and stack into the
// Rubble "R" on its orange tile. Pure CSS so it shows from the server HTML,
// before any JS (three.js is a big download on a cold visit), and stays up
// until the 3D models have finished loading.

const R = ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#']

// Bottom row first, left to right — the way you'd actually lay bricks.
const BRICKS = R.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? { x, y } : null)))
  .filter((b): b is { x: number; y: number } => b !== null)
  .sort((a, b) => b.y - a.y || a.x - b.x)

export default function LoadingScreen({ progress, leaving }: { progress: number | null; leaving: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#9fd4ef] transition-opacity duration-500 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="loading-tile relative flex h-36 w-36 items-center justify-center rounded-[32px] bg-[#ff6b1a] shadow-[0_6px_0_#c94e0a]">
        <div className="relative" style={{ width: 5 * 17 - 3, height: 7 * 13 - 3 }}>
          {BRICKS.map((b, i) => (
            <span
              key={`${b.x}-${b.y}`}
              className="loading-brick absolute rounded-[3px] bg-white shadow-[0_2px_0_rgba(0,0,0,0.18)]"
              style={{ left: b.x * 17, top: b.y * 13, width: 14, height: 10, animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>

      <p className="font-display text-5xl text-white [text-shadow:0_4px_0_#1d3a6e]">Rubble</p>

      <div className="h-3 w-52 overflow-hidden rounded-full bg-[#1d3a6e]">
        {progress === null ? (
          <div className="loading-sweep h-full w-1/3 rounded-full bg-[#ff6b1a]" />
        ) : (
          <div className="h-full rounded-full bg-[#ff6b1a] transition-[width] duration-300" style={{ width: `${Math.max(8, progress)}%` }} />
        )}
      </div>
      <p className="-mt-3 font-display text-sm text-[#1d3a6e]">Setting up the site…</p>
    </div>
  )
}
