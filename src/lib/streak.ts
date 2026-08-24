import type { SupabaseClient } from '@supabase/supabase-js'

// Streak "days" are tracked in UTC to keep the math independent of each
// player's local timezone — a challenge's drop_at date is its day.
function toDateString(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function addDays(dateString: string, days: number): string {
  const d = new Date(dateString + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Shared by both instant grading (text/multiple_choice, in submitAnswer) and
// deferred grading (a photo response, once a mod approves it) — whichever
// path finally knows "this counts as today's correct answer" calls this.
export async function updateStreakForAnswer(
  supabase: SupabaseClient,
  userId: string,
  challengeDropAt: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, longest_streak, last_answered_date')
    .eq('id', userId)
    .single()

  const challengeDate = toDateString(challengeDropAt)
  const yesterday = addDays(challengeDate, -1)
  const currentStreak = profile?.last_answered_date === yesterday ? (profile?.current_streak ?? 0) + 1 : 1
  const longestStreak = Math.max(profile?.longest_streak ?? 0, currentStreak)

  await supabase
    .from('profiles')
    .update({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_answered_date: challengeDate,
    })
    .eq('id', userId)

  return { currentStreak, longestStreak }
}
