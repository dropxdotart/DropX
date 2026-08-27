'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createChallenge, updateChallenge, type ChallengeInput } from './actions'
import type { ChallengeAdmin, ChallengeType } from '@/lib/types'

export default function ChallengeForm({ existing }: { existing?: ChallengeAdmin }) {
  const router = useRouter()
  const [type, setType] = useState<ChallengeType>(existing?.type ?? 'multiple_choice')
  const [prompt, setPrompt] = useState(existing?.prompt ?? '')
  const [choices, setChoices] = useState<string[]>(existing?.choices ?? ['', '', '', ''])
  const [correctAnswer, setCorrectAnswer] = useState(existing?.correct_answer ?? '')
  const [explanation, setExplanation] = useState(existing?.explanation ?? '')
  const [tags, setTags] = useState(existing?.tags?.join(', ') ?? '')
  const [scheduledDate, setScheduledDate] = useState(existing?.scheduled_date ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const input: ChallengeInput = {
      type,
      prompt,
      choices: type === 'multiple_choice' ? choices : null,
      correct_answer: correctAnswer,
      explanation: explanation || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      scheduled_date: scheduledDate || null,
    }
    startTransition(async () => {
      try {
        if (existing) {
          await updateChallenge(existing.id, input)
          toast.success('Challenge updated')
        } else {
          await createChallenge(input)
          toast.success('Challenge added to the pool')
        }
        router.push('/admin/challenges')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <Card className="border-white/10 bg-card">
      <CardHeader>
        <CardTitle className="text-base">{existing ? 'Edit challenge' : 'New challenge'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value as ChallengeType)}>
              <option value="multiple_choice">Multiple choice</option>
              <option value="text">Text / riddle</option>
              <option value="photo">Photo</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Prompt</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} required />
          </div>

          {type === 'multiple_choice' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Choices</label>
              <div className="grid grid-cols-2 gap-2">
                {choices.map((choice, i) => (
                  <Input
                    key={i}
                    value={choice}
                    placeholder={`Choice ${i + 1}`}
                    onChange={(e) => {
                      const next = [...choices]
                      next[i] = e.target.value
                      setChoices(next)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {type !== 'photo' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Correct answer</label>
                {type === 'multiple_choice' ? (
                  // A dropdown of the actual choices, not free text — typing the
                  // answer separately from the choices risks a typo that makes
                  // the challenge ungradeable (grading is exact-string against
                  // this field). The current value stays selectable even if it
                  // no longer matches a choice, so editing never silently drops it.
                  <Select value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required>
                    <option value="">Select the correct choice…</option>
                    {[...new Set([correctAnswer, ...choices])].filter((c) => c.trim()).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                ) : (
                  <Input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Explanation (optional)</label>
                <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trivia, pop culture" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Scheduled date (optional)</label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
          </div>

          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {existing ? 'Save changes' : 'Add to pool'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
