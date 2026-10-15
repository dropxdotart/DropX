import VersionTag from './VersionTag'

// Vercel sets this automatically on every deploy (no env var setup needed) —
// reading it server-side and passing the resolved string down means no
// NEXT_PUBLIC_ toggle or client-side env access is required. Blank outside
// Vercel (local dev), where there's no meaningful build to label.
export default function VersionBadge() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return <VersionTag label={sha ? sha.slice(0, 7) : 'dev'} />
}
