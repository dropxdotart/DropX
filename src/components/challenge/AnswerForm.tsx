'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { submitAnswer, submitPhotoAnswer } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/lib/types'
import ResultCard from './ResultCard'
import PendingReviewCard from './PendingReviewCard'

export default function AnswerForm({ challenge }: { challenge: Challenge }) {
  const [selected, setSelected] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitAnswer>> | null>(null)
  const [givenAnswer, setGivenAnswer] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submittedPhotoUrl, setSubmittedPhotoUrl] = useState<string | null>(null)

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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handlePhotoSubmit = async () => {
    if (!photoFile || submitting) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to answer')

      const ext = photoFile.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('challenge-photos')
        .upload(path, photoFile)
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('challenge-photos').getPublicUrl(path)
      await submitPhotoAnswer(challenge.id, publicUrl)
      setSubmittedPhotoUrl(publicUrl)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <ResultCard
        responseId={result.id}
        challenge={challenge}
        answer={givenAnswer}
        isCorrect={result.isCorrect}
        correctAnswer={result.correctAnswer}
        explanation={result.explanation}
        currentStreak={result.currentStreak}
      />
    )
  }

  if (submittedPhotoUrl) {
    return <PendingReviewCard photoUrl={submittedPhotoUrl} />
  }

  return (
    <div className="w-full max-w-sm space-y-5">
      <p className="text-xl font-semibold text-center leading-snug">{challenge.prompt}</p>

      {challenge.type === 'photo' ? (
        <div className="space-y-3">
          <label
            htmlFor="photo-input"
            className="flex flex-col items-center justify-center gap-2 aspect-square rounded-xl border border-dashed border-white/15 bg-white/5 backdrop-blur-sm cursor-pointer overflow-hidden hover:border-[color:var(--neon-violet)]/60 transition-colors"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <>
                <Camera className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Tap to take or choose a photo</span>
              </>
            )}
          </label>
          <input
            id="photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            disabled={submitting}
            className="hidden"
          />
          <Button
            className="w-full h-11 rounded-xl glow-violet"
            disabled={!photoFile || submitting}
            onClick={handlePhotoSubmit}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Submit photo
          </Button>
        </div>
      ) : challenge.type === 'multiple_choice' && challenge.choices ? (
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
