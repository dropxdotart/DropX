'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { deleteChallenge } from './actions'
import type { ChallengeAdmin } from '@/lib/types'

export default function ChallengeRow({
  challenge,
  stats,
}: {
  challenge: ChallengeAdmin
  stats: { count: number; correct: number } | undefined
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, startTransition] = useTransition()
  const locked = Boolean(challenge.drop_at)

  const handleRowClick = () => {
    if (locked) setOpen(true)
    else router.push(`/admin/challenges/${challenge.id}`)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this challenge from the pool?')) return
    startTransition(async () => {
      try {
        await deleteChallenge(challenge.id)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <>
      <tr onClick={handleRowClick} className="border-b border-white/5 last:border-0 hover:bg-white/5 cursor-pointer">
        <td className="p-2.5 max-w-xs truncate text-white">{challenge.prompt}</td>
        <td className="p-2.5 capitalize text-muted-foreground">{challenge.type.replace('_', ' ')}</td>
        <td className="p-2.5">
          <div className="flex gap-1 flex-wrap">
            {challenge.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>)}
          </div>
        </td>
        <td className="p-2.5">
          {challenge.drop_at ? (
            <span className="text-xs text-muted-foreground">Used {new Date(challenge.drop_at).toLocaleDateString()}</span>
          ) : challenge.scheduled_date ? (
            <Badge variant="outline" className="gap-1 border-[color:var(--neon-violet)]/40 text-[color:var(--neon-violet)] text-[10px] px-1.5 py-0">
              Scheduled {challenge.scheduled_date}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Pool</span>
          )}
        </td>
        <td className="p-2.5 text-xs text-muted-foreground tabular-nums">
          {stats ? `${stats.count} responses, ${Math.round((stats.correct / stats.count) * 100)}% correct` : '—'}
        </td>
        <td className="p-2.5">
          {locked ? (
            <span className="text-xs text-muted-foreground">Locked</span>
          ) : (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          )}
        </td>
      </tr>

      {locked && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{challenge.prompt}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0">{challenge.type.replace('_', ' ')}</Badge>
                {challenge.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>)}
              </div>

              {challenge.type === 'multiple_choice' && challenge.choices && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Choices</p>
                  <div className="flex flex-wrap gap-1.5">
                    {challenge.choices.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className={cn('text-xs', c === challenge.correct_answer && 'border-green-500/40 text-green-400')}
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {challenge.type !== 'photo' && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Correct answer</p>
                  <p>{challenge.correct_answer}</p>
                </div>
              )}

              {challenge.explanation && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Explanation</p>
                  <p className="text-muted-foreground">{challenge.explanation}</p>
                </div>
              )}

              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Dropped</p>
                <p className="text-muted-foreground">{new Date(challenge.drop_at!).toLocaleString()}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Stats</p>
                <p className="text-muted-foreground">
                  {stats ? `${stats.count} responses, ${Math.round((stats.correct / stats.count) * 100)}% correct` : 'No responses yet'}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
