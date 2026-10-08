// Shown instead of the game while it's switched off for building work
// (Admin → Maintenance). Pure markup, no 3D.
export default function BuildingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-[#9fd4ef] px-8 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center rounded-[30px] bg-[#ff6b1a] text-6xl shadow-[0_6px_0_#c94e0a]">
        🚧
      </div>
      <p className="font-display text-5xl text-white [text-shadow:0_4px_0_#1d3a6e]">Sorry, building!</p>
      <p className="max-w-xs font-display text-lg leading-snug text-[#1d3a6e]">
        Our crew is rebuilding Rubble from the ground up. Come back soon!
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-4 w-7 animate-pulse rounded-[4px] bg-white shadow-[0_2px_0_rgba(0,0,0,0.18)]"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  )
}
