import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Flame, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
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
    <Card className="w-full max-w-sm border-white/10 bg-card/60 backdrop-blur-sm">
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
        <CardTitle className="text-lg">{isCorrect ? 'Correct!' : 'Not quite'}</CardTitle>
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
          <Badge className="gap-1 border-0 bg-gradient-to-r from-[color:var(--neon-orange)] to-[color:var(--neon-pink)] text-black font-semibold px-3 py-1">
            <Flame className="w-3.5 h-3.5" fill="currentColor" />
            {currentStreak} day streak
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
