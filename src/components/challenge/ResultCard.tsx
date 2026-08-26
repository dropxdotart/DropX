'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Flame, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { deleteMyResponse } from '@/app/actions'
import type { Challenge } from '@/lib/types'

export default function ResultCard({
  responseId,
  challenge,
  answer,
  isCorrect,
  correctAnswer,
  explanation,
  currentStreak,
  photoUrl,
  initiallyDeleted,
}: {
  responseId: string
  challenge: Challenge
  answer: string
  isCorrect: boolean
  correctAnswer: string
  explanation: string | null
  currentStreak?: number
  photoUrl?: string | null
  initiallyDeleted?: boolean
}) {
  const [deleted, setDeleted] = useState(initiallyDeleted ?? false)
  const [deleting, setDeleting] = useState(false)
  const isPhoto = challenge.type === 'photo'

  const handleDelete = async () => {
    if (deleting) return
    if (!confirm("Delete your answer? You won't be able to answer this challenge again.")) return
    setDeleting(true)
    try {
      await deleteMyResponse(responseId)
      setDeleted(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <Card className="w-full max-w-sm border-white/10 bg-card/60 backdrop-blur-sm">
        <CardContent className="py-8 text-center space-y-1.5">
          <p className="font-medium">You deleted your answer</p>
          <p className="text-sm text-muted-foreground">It won&apos;t reappear — check back for tomorrow&apos;s challenge.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
      {isPhoto && photoUrl && (
        <div className="w-full aspect-square bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions */}
          <img src={photoUrl} alt="Your submission" className="w-full h-full object-cover" />
        </div>
      )}
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          <div className={cn('rounded-full p-3', isCorrect ? 'glow-green bg-green-500/10' : 'glow-pink bg-destructive/10')}>
            {isCorrect ? (
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            ) : (
              <XCircle className="w-9 h-9 text-destructive" />
            )}
          </div>
        </div>
        <CardTitle className="text-lg">
          {isPhoto ? (isCorrect ? 'Approved!' : 'Not approved') : isCorrect ? 'Correct!' : 'Not quite'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">{challenge.prompt}</p>
        {!isPhoto && (
          <div className="space-y-1">
            <p className="text-sm">Your answer: <span className="font-medium">{answer}</span></p>
            {!isCorrect && (
              <p className="text-sm">Correct answer: <span className="font-medium">{correctAnswer}</span></p>
            )}
          </div>
        )}
        {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
        {typeof currentStreak === 'number' && (
          <Badge className="gap-1 border-0 bg-gradient-to-r from-[color:var(--neon-orange)] to-[color:var(--neon-pink)] text-black font-semibold px-3 py-1">
            <Flame className="w-3.5 h-3.5" fill="currentColor" />
            {currentStreak} day streak
          </Badge>
        )}
        <div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={deleting} onClick={handleDelete}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
            Delete my answer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
