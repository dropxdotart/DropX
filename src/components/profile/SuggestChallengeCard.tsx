'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { submitChallengeIdea } from '@/app/actions'
import type { ChallengeType } from '@/lib/types'

export default function SuggestChallengeCard() {
  const [type, setType] = useState<ChallengeType>('text')
  const [idea, setIdea] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!idea.trim() || isPending) return
    startTransition(async () => {
      try {
        await submitChallengeIdea(type, idea)
        toast.success("Thanks — we'll take a look!")
        setIdea('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <Card className="border-white/10 bg-card/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Lightbulb className="w-4 h-4 text-[color:var(--neon-orange)]" />
          Suggest a challenge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. Take a photo of the weirdest thing in your fridge"
          maxLength={300}
          rows={2}
          disabled={isPending}
        />
        <div className="flex gap-2">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as ChallengeType)}
            className="flex-1"
            disabled={isPending}
          >
            <option value="text">Text answer</option>
            <option value="multiple_choice">Multiple choice</option>
            <option value="photo">Photo</option>
          </Select>
          <Button size="sm" variant="secondary" disabled={isPending || !idea.trim()} onClick={handleSubmit}>
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
