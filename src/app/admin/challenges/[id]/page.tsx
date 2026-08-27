import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ChallengeForm from '../ChallengeForm'
import type { ChallengeAdmin } from '@/lib/types'

export default async function EditChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: challenge } = await supabase.from('challenges').select('*').eq('id', id).single()

  if (!challenge) notFound()

  // Used challenges (real drop_at) are locked server-side too (see
  // updateChallenge) — this just makes that visible instead of showing a
  // fully editable form that only fails once submitted. The normal UI
  // never links here for a locked challenge anymore (the table row opens a
  // read-only dialog instead), but the URL itself still resolves.
  if (challenge.drop_at) {
    return (
      <div className="rounded-xl border border-white/10 bg-card p-4 space-y-2">
        <p className="text-sm font-medium text-white">{challenge.prompt}</p>
        <p className="text-xs text-muted-foreground">
          This challenge already dropped on {new Date(challenge.drop_at).toLocaleDateString()} and can no longer be edited.
        </p>
        <Link href="/admin/challenges" className="text-xs text-[color:var(--neon-violet)] hover:underline">
          Back to challenges
        </Link>
      </div>
    )
  }

  return <ChallengeForm existing={challenge as ChallengeAdmin} />
}
