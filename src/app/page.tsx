import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WaitingCard from '@/components/challenge/WaitingCard'
import AnswerForm from '@/components/challenge/AnswerForm'
import ResultCard from '@/components/challenge/ResultCard'
import PendingReviewCard from '@/components/challenge/PendingReviewCard'
import type { Challenge, ChallengeWithAnswer } from '@/lib/types'
import { etWindowToday, formatHourLabel } from '@/lib/time'
import { getAppConfig } from '@/lib/config'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Signed-out visitors never see challenge status — they land on sign-in.
  if (!user) redirect('/auth')

  // Scope to today's window so a challenge that dropped on a *previous* day
  // (and was never answered) doesn't linger as "today's" challenge.
  const config = await getAppConfig(supabase)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const { data: challenge } = await supabase
    .from('challenges')
    .select('*')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle<ChallengeWithAnswer>()

  if (!challenge) {
    const windowLabel = `${formatHourLabel(config.drop_window_start_hour)}–${formatHourLabel(config.drop_window_end_hour)}`
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <WaitingCard windowLabel={windowLabel} />
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

  const { data: response } = await supabase
    .from('responses')
    .select('*')
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (response) {
    // Still awaiting a mod's decision — is_correct is only set once approved/rejected.
    if (response.is_correct === null) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
          <PendingReviewCard photoUrl={response.photo_url ?? ''} />
        </div>
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak')
      .eq('id', user.id)
      .single()

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <ResultCard
          responseId={response.id}
          challenge={publicChallenge}
          answer={response.answer}
          isCorrect={response.is_correct}
          correctAnswer={challenge.correct_answer}
          explanation={challenge.explanation}
          currentStreak={profile?.current_streak}
          photoUrl={response.photo_url}
          initiallyDeleted={!!response.deleted_at}
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
