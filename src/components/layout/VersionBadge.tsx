// Vercel sets this automatically on every deploy (no env var setup needed) —
// reading it server-side and passing the resolved string down means no
// NEXT_PUBLIC_ toggle or client-side env access is required. Blank outside
// Vercel (local dev), where there's no meaningful build to label.
export default function VersionBadge() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  const label = sha ? sha.slice(0, 7) : 'dev'

  return (
    <span className="fixed bottom-2 right-2 z-40 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground select-none">
      {label}
    </span>
  )
}
