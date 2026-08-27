import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { etDateToday } from '@/lib/time'
import ChallengeRow from './ChallengeRow'
import ChallengeCalendar from './ChallengeCalendar'
import type { ChallengeAdmin, ChallengeIdea } from '@/lib/types'

type IdeaWithSubmitter = ChallengeIdea & { submitter: { username: string | null; display_name: string | null } | null }

export default async function AdminChallengesPage() {
  const supabase = await createClient()

  const { data: challenges } = await supabase
    .from('challenges')
    .select('*')
    .order('created_at', { ascending: false })

  const items = (challenges ?? []) as ChallengeAdmin[]
  const usedIds = items.filter((c) => c.drop_at).map((c) => c.id)

  const { data: responses } = usedIds.length
    ? await supabase.from('responses').select('challenge_id, is_correct').in('challenge_id', usedIds)
    : { data: [] }

  const statsByChallenge = new Map<string, { count: number; correct: number }>()
  for (const r of responses ?? []) {
    const s = statsByChallenge.get(r.challenge_id) ?? { count: 0, correct: 0 }
    s.count += 1
    if (r.is_correct) s.correct += 1
    statsByChallenge.set(r.challenge_id, s)
  }

  const { data: ideas } = await supabase
    .from('challenge_ideas')
    .select('id, submitted_by, type, idea, created_at, submitter:profiles!submitted_by(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(50)
  const ideaItems = (ideas ?? []) as unknown as IdeaWithSubmitter[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} challenge{items.length === 1 ? '' : 's'}</p>
        <Link href="/admin/challenges/new" className={cn(buttonVariants({ size: 'sm', variant: 'secondary' }))}>
          <Plus className="w-4 h-4 mr-1" />
          New challenge
        </Link>
      </div>

      <div className="rounded-xl border border-white/10 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-[color:var(--neon-orange)]" />
            Coming soon — user ideas
          </h2>
          <span className="text-xs text-muted-foreground">{ideaItems.length}</span>
        </div>
        {ideaItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No submitted ideas yet.</p>
        ) : (
          <div className="divide-y divide-white/5 max-h-56 overflow-y-auto">
            {ideaItems.map((idea) => (
              <div key={idea.id} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white">{idea.idea}</p>
                  <p className="text-xs text-muted-foreground">
                    {idea.submitter?.display_name ?? idea.submitter?.username ?? 'Someone'} · {new Date(idea.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0 shrink-0">{idea.type.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChallengeCalendar items={items} todayDate={etDateToday()} />

      <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
              <th className="p-2.5 font-medium">Prompt</th>
              <th className="p-2.5 font-medium">Type</th>
              <th className="p-2.5 font-medium">Tags</th>
              <th className="p-2.5 font-medium">Status</th>
              <th className="p-2.5 font-medium">Stats</th>
              <th className="p-2.5 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <ChallengeRow key={c.id} challenge={c} stats={statsByChallenge.get(c.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
