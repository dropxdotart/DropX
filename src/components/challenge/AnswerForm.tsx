'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { submitAnswer } from '@/app/actions'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/lib/types'
import ResultCard from './ResultCard'

export default function AnswerForm({ challenge }: { challenge: Challenge }) {
  const [selected, setSelected] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitAnswer>> | null>(null)
  const [givenAnswer, setGivenAnswer] = useState('')

  const handleSubmit = async (answer: string) => {
    if (!answer.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await submitAnswer(challenge.id, answer)
      setGivenAnswer(answer)
      setResult(res)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <ResultCard
        challenge={challenge}
        answer={givenAnswer}
        isCorrect={result.isCorrect}
        correctAnswer={result.correctAnswer}
        explanation={result.explanation}
        currentStreak={result.currentStreak}
      />
    )
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      <p className="text-xl font-semibold text-center leading-snug">{challenge.prompt}</p>

      {challenge.type === 'multiple_choice' && challenge.choices ? (
        <div className="grid gap-2.5">
          {challenge.choices.map((choice) => (
            <Button
              key={choice}
              variant="outline"
              className={cn(
                'justify-start h-auto py-3.5 rounded-xl border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:border-[color:var(--neon-violet)]/60 hover:bg-white/10 hover:glow-violet',
                selected === choice && submitting && 'border-[color:var(--neon-violet)]/70 glow-violet'
              )}
              disabled={submitting}
              onClick={() => {
                setSelected(choice)
                handleSubmit(choice)
              }}
            >
              {submitting && selected === choice && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {choice}
            </Button>
          ))}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit(selected)
          }}
        >
          <Input
            placeholder="Your answer"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={submitting}
            className="h-11 rounded-xl border-white/10 bg-white/5 focus-visible:ring-[color:var(--neon-violet)]/50"
          />
          <Button type="submit" disabled={submitting} className="h-11 rounded-xl glow-violet">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit
          </Button>
        </form>
      )}
    </div>
  )
}
