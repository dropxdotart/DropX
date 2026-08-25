import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import ChallengeRowActions from './ChallengeRowActions'
import type { ChallengeAdmin } from '@/lib/types'

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} challenge{items.length === 1 ? '' : 's'}</p>
        <Link href="/admin/challenges/new" className={cn(buttonVariants({ size: 'sm' }), 'glow-violet')}>
          <Plus className="w-4 h-4 mr-1" />
          New challenge
        </Link>
      </div>

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
            {items.map((c) => {
              const stats = statsByChallenge.get(c.id)
              return (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="p-2.5 max-w-xs truncate text-white">{c.prompt}</td>
                  <td className="p-2.5 capitalize text-muted-foreground">{c.type.replace('_', ' ')}</td>
                  <td className="p-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>)}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {c.drop_at ? (
                      <span className="text-xs text-muted-foreground">Used {new Date(c.drop_at).toLocaleDateString()}</span>
                    ) : c.scheduled_date ? (
                      <Badge className="gap-1 border-0 gradient-hero text-white text-[10px] px-1.5 py-0">
                        Scheduled {c.scheduled_date}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pool</span>
                    )}
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground tabular-nums">
                    {stats ? `${stats.count} responses, ${Math.round((stats.correct / stats.count) * 100)}% correct` : '—'}
                  </td>
                  <td className="p-2.5">
                    {c.drop_at ? (
                      <span className="text-xs text-muted-foreground">Locked</span>
                    ) : (
                      <ChallengeRowActions id={c.id} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
