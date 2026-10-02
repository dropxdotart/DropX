import { decodeCells, frontView, type ShapeSize } from '@/lib/game/shapes'

// A small front-on picture of a building's shape (server-rendered SVG).
export default function Thumb({ size, cells, data }: { size: ShapeSize; cells?: Uint8Array; data?: string }) {
  const grid = cells ?? decodeCells(size, data ?? '')
  const runs = frontView(size, grid)
  const [W, H] = size
  return (
    <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="h-11 w-11 shrink-0 rounded-lg bg-[#9fd4ef]" preserveAspectRatio="xMidYMax meet" aria-hidden>
      {runs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1.02} fill={r.color} />
      ))}
    </svg>
  )
}
