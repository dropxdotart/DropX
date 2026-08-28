'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { submitChallengeIdea } from '@/app/actions'
import type { ChallengeType } from '@/lib/types'

// Reuses the same action the (not-yet-built) user-facing submission form
// will use — an idea is just loose inspiration text + a rough type, so an
// admin adding their own goes through the identical path rather than a
// separate admin-only insert.
export default function AddIdeaForm() {
  const [idea, setIdea] = useState('')
  const [type, setType] = useState<ChallengeType>('text')
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const submit = () => {
    const trimmed = idea.trim()
    if (!trimmed) return
    startTransition(async () => {
      try {
        await submitChallengeIdea(type, trimmed)
        setIdea('')
        toast.success('Added to the backlog')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      <p className="text-sm font-medium text-foreground">Add an idea</p>
      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Rough idea, not a finished challenge — e.g. &quot;caption this photo of the office fridge&quot;"
        maxLength={300}
        rows={3}
        disabled={pending}
      />
      <div className="flex items-center justify-between gap-2">
        <Select
          className="w-40"
          value={type}
          onChange={(e) => setType(e.target.value as ChallengeType)}
          disabled={pending}
        >
          <option value="multiple_choice">Multiple choice</option>
          <option value="text">Text</option>
          <option value="photo">Photo</option>
        </Select>
        <Button type="submit" size="sm" disabled={pending || !idea.trim()}>
          {pending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
          Add
        </Button>
      </div>
    </form>
  )
}
