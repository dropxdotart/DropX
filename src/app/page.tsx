import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import WaitingCard from '@/components/challenge/WaitingCard'
import AnswerForm from '@/components/challenge/AnswerForm'
import ResultCard from '@/components/challenge/ResultCard'
import type { Challenge, ChallengeWithAnswer } from '@/lib/types'
import { etWindowToday } from '@/lib/time'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Scope to today's window so a challenge that dropped on a *previous* day
  // (and was never answered) doesn't linger as "today's" challenge.
  const { start, end } = etWindowToday(12, 19)
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle<ChallengeWithAnswer>()

  if (!challenge) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <WaitingCard />
      </div>
    )
  }

  // Strip the answer/explanation before this ever reaches a client component's
  // serialized props — AnswerForm only learns them via the server action result.
  const publicChallenge: Challenge = {
    id: challenge.id,
    drop_at: challenge.drop_at,
    type: challenge.type,
    prompt: challenge.prompt,
    choices: challenge.choices,
    created_at: challenge.created_at,
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 gap-4">
        <Card className="w-full max-w-sm text-center border-white/10 bg-card/60 backdrop-blur-sm glow-violet">
          <CardHeader>
            <CardTitle className="text-lg">Today&apos;s challenge is live</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{publicChallenge.prompt}</p>
            <Link href="/auth" className={cn(buttonVariants(), 'w-full glow-violet')}>
              Sign in to answer
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: response } = await supabase
    .from('responses')
    .select('*')
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (response) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak')
      .eq('id', user.id)
      .single()

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <ResultCard
          challenge={publicChallenge}
          answer={response.answer}
          isCorrect={response.is_correct}
          correctAnswer={challenge.correct_answer}
          explanation={challenge.explanation}
          currentStreak={profile?.current_streak}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <AnswerForm challenge={publicChallenge} />
    </div>
  )
}
