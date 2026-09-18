import type { SupabaseClient } from '@supabase/supabase-js'

// Streak "days" are tracked in UTC to keep the math independent of each
// player's local timezone — a drop's drop_at date is its day.
function toDateString(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function todayDateString(): string {
  return toDateString(new Date().toISOString())
}

function addDays(dateString: string, days: number): string {
  const d = new Date(dateString + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Shared by every path that finally knows "this counts as today's
// participation" — an instant hot-take vote, or a caption/dare once a mod
// approves it.
export async function creditStreakForDrop(
  supabase: SupabaseClient,
  userId: string,
  dropAt: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_streak, longest_streak, last_answered_date')
    .eq('id', userId)
    .single()

  const dropDate = toDateString(dropAt)
  const yesterday = addDays(dropDate, -1)
  const currentStreak = profile?.last_answered_date === yesterday ? (profile?.current_streak ?? 0) + 1 : 1
  const longestStreak = Math.max(profile?.longest_streak ?? 0, currentStreak)

  await supabase
    .from('profiles')
    .update({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_answered_date: dropDate,
    })
    .eq('id', userId)

  return { currentStreak, longestStreak }
}

export type StreakDay = {
  date: string
  counts: boolean
  overridden: boolean
  hasResponse: boolean
}

type DropAt = { drop_at: string | null }

// Merges real participation (hot take votes count instantly; captions/dares
// only once approved) with any manual streak_overrides for that date — an
// override always wins. Ordered most-recent first. `days` bounds how far
// back to look; pass a large number (recomputeStreakForUser does) to walk
// full history. Three separate queries + a client-side merge, since
// PostgREST has no UNION across the three response tables.
export async function getStreakCalendar(
  supabase: SupabaseClient,
  userId: string,
  days: number
): Promise<StreakDay[]> {
  const today = todayDateString()
  const since = addDays(today, -days)

  const [{ data: votes }, { data: captions }, { data: dares }, { data: overrides }] = await Promise.all([
    supabase.from('hot_take_votes').select('drops!inner(drop_at)').eq('user_id', userId).not('drops.drop_at', 'is', null),
    supabase
      .from('caption_responses')
      .select('moderation_status, drops!inner(drop_at)')
      .eq('user_id', userId)
      .not('drops.drop_at', 'is', null),
    supabase
      .from('dare_submissions')
      .select('moderation_status, drops!inner(drop_at)')
      .eq('user_id', userId)
      .not('drops.drop_at', 'is', null),
    supabase.from('streak_overrides').select('date, counts').eq('user_id', userId).gte('date', since),
  ])

  const byDate = new Map<string, { counts: boolean; hasResponse: boolean; overridden: boolean }>()

  const mark = (dropAt: string | null | undefined, counts: boolean) => {
    if (!dropAt) return
    const date = toDateString(dropAt)
    if (date < since) return
    // A date might already be marked by a different drop type across
    // history (shouldn't happen day-to-day since only one drop goes live
    // per day, but favor "counts" if it ever does).
    const existing = byDate.get(date)
    byDate.set(date, { counts: counts || Boolean(existing?.counts), hasResponse: true, overridden: false })
  }

  for (const v of votes ?? []) mark((v.drops as unknown as DropAt).drop_at, true)
  for (const c of captions ?? []) mark((c.drops as unknown as DropAt).drop_at, c.moderation_status === 'approved')
  for (const d of dares ?? []) mark((d.drops as unknown as DropAt).drop_at, d.moderation_status === 'approved')

  for (const o of overrides ?? []) {
    const existing = byDate.get(o.date)
    byDate.set(o.date, { counts: o.counts, hasResponse: existing?.hasResponse ?? false, overridden: true })
  }

  const result: StreakDay[] = []
  for (let cursor = today; cursor >= since; cursor = addDays(cursor, -1)) {
    const entry = byDate.get(cursor)
    result.push({
      date: cursor,
      counts: entry?.counts ?? false,
      overridden: entry?.overridden ?? false,
      hasResponse: entry?.hasResponse ?? false,
    })
  }
  return result
}

// Walks full history (real answers + overrides) and refreshes the
// profiles.current_streak / longest_streak / last_answered_date cache from
// it — the same audit-trail-vs-cache split as strikes/strike_count. Call
// this after any streak_overrides write.
export async function recomputeStreakForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ currentStreak: number; longestStreak: number }> {
  const calendar = await getStreakCalendar(supabase, userId, 3650)
  const countedDates = calendar.filter((d) => d.counts).map((d) => d.date).sort()

  let longestStreak = 0
  let runLength = 0
  let prevDate: string | null = null

  for (const date of countedDates) {
    runLength = prevDate && addDays(prevDate, 1) === date ? runLength + 1 : 1
    longestStreak = Math.max(longestStreak, runLength)
    prevDate = date
  }

  const currentStreak = runLength
  const lastAnsweredDate = countedDates.length ? countedDates[countedDates.length - 1] : null

  await supabase
    .from('profiles')
    .update({ current_streak: currentStreak, longest_streak: longestStreak, last_answered_date: lastAnsweredDate })
    .eq('id', userId)

  return { currentStreak, longestStreak }
}

// Forces a specific date to count (or not) toward the streak, regardless of
// what the real response says — the actual correction lever, distinct from
// clearStreakDayOverride which reverts a date back to trusting the response.
export async function setStreakDayOverride(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  counts: boolean,
  setBy: string
): Promise<void> {
  const { error } = await supabase
    .from('streak_overrides')
    .upsert({ user_id: userId, date, counts, set_by: setBy }, { onConflict: 'user_id,date' })
  if (error) throw new Error(error.message)
}

export async function clearStreakDayOverride(supabase: SupabaseClient, userId: string, date: string): Promise<void> {
  const { error } = await supabase.from('streak_overrides').delete().eq('user_id', userId).eq('date', date)
  if (error) throw new Error(error.message)
}

export { todayDateString, addDays, toDateString }
