import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Flame, CheckCircle2, XCircle } from 'lucide-react'
import type { Challenge } from '@/lib/types'

export default function ResultCard({
  challenge,
  answer,
  isCorrect,
  correctAnswer,
  explanation,
  currentStreak,
}: {
  challenge: Challenge
  answer: string
  isCorrect: boolean
  correctAnswer: string
  explanation: string | null
  currentStreak?: number
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          {isCorrect ? (
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          ) : (
            <XCircle className="w-10 h-10 text-destructive" />
          )}
        </div>
        <CardTitle>{isCorrect ? 'Correct!' : 'Not quite'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">{challenge.prompt}</p>
        <div className="space-y-1">
          <p className="text-sm">Your answer: <span className="font-medium">{answer}</span></p>
          {!isCorrect && (
            <p className="text-sm">Correct answer: <span className="font-medium">{correctAnswer}</span></p>
          )}
        </div>
        {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
        {typeof currentStreak === 'number' && (
          <Badge variant="secondary" className="gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            {currentStreak} day streak
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
