'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { submitAnswer } from '@/app/actions'
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
    <div className="w-full max-w-sm space-y-3">
      <p className="text-lg font-medium text-center">{challenge.prompt}</p>

      {challenge.type === 'multiple_choice' && challenge.choices ? (
        <div className="grid gap-2">
          {challenge.choices.map((choice) => (
            <Button
              key={choice}
              variant="outline"
              className="justify-start h-auto py-3"
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
          />
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit
          </Button>
        </form>
      )}
    </div>
  )
}
