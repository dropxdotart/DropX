import Link from 'next/link'
import { Hammer, Lightbulb } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import AddIdeaForm from './AddIdeaForm'
import ChallengeComposer from './ChallengeComposer'
import type { ChallengeType } from '@/lib/types'

const TYPE_LABEL: Record<ChallengeType, string> = {
  multiple_choice: 'Multiple choice',
  text: 'Text',
  photo: 'Photo',
}

type IdeaRow = {
  id: string
  type: ChallengeType
  idea: string
  created_at: string
  profiles: { username: string | null; display_name: string | null } | null
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
      <div className="rounded-full bg-muted p-3">
        <Hammer className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Work happening</p>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">
          {label} is next up in the challenge system rebuild — not live yet.
        </p>
      </div>
    </div>
  )
}

// The rest of the challenge system (composer, scheduling) is still being
// rebuilt — see the two Placeholder tabs below. Ideas is the first piece to
// land: a read-only backlog of everyone's suggestions, on purpose with no
// link into the (not yet built) composer — see AddIdeaForm's note.
export default async function AdminChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = tabParam === 'new' ? 'new' : tabParam === 'schedule' ? 'schedule' : 'ideas'

  const admin = createAdminClient()

  const { data: ideas } = await admin
    .from('challenge_ideas')
    .select('id, type, idea, created_at, profiles(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const tabClass = (active: boolean) =>
    cn(
      'px-3 py-2 text-sm border-b-2 transition-colors',
      active ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-wide">Challenges</h1>
        <nav className="flex items-center gap-1 mt-3 border-b border-border">
          <Link href="/admin/challenges?tab=ideas" className={tabClass(tab === 'ideas')}>Ideas</Link>
          <Link href="/admin/challenges?tab=new" className={tabClass(tab === 'new')}>New challenge</Link>
          <Link href="/admin/challenges?tab=schedule" className={tabClass(tab === 'schedule')}>Schedule</Link>
        </nav>
      </div>

      {tab === 'ideas' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            {(!ideas || ideas.length === 0) && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-16 text-center">
                <Lightbulb className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No ideas yet — add one, or wait for users to submit theirs.</p>
              </div>
            )}
            {(ideas as unknown as IdeaRow[] | null)?.map((row) => (
              <div key={row.id} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
                <Badge variant="secondary" className="shrink-0 mt-0.5">{TYPE_LABEL[row.type]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{row.idea}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {row.profiles?.display_name ?? row.profiles?.username ?? 'Unknown'} · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <AddIdeaForm />
            <p className="text-[11px] text-muted-foreground px-1">
              A pure inspiration list — nothing here links automatically into a real challenge. Building one from an idea is a manual step on the New challenge tab.
            </p>
          </div>
        </div>
      )}

      {tab === 'new' && <ChallengeComposer />}
      {tab === 'schedule' && <Placeholder label="Scheduling & push" />}
    </div>
  )
}
