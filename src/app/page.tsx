import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WaitingCard from '@/components/drop/WaitingCard'
import HotTakeCard from '@/components/drop/HotTakeCard'
import { etWindowToday, formatHourLabel } from '@/lib/time'
import { getAppConfig } from '@/lib/config'
import { getHotTakeCounts } from '@/app/actions'
import type { Drop } from '@/lib/types'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Signed-out visitors never see drop status — they land on sign-in.
  if (!user) redirect('/auth')

  // Scope to today's window so a drop from a *previous* day (never
  // finished) doesn't linger as "today's" drop.
  const config = await getAppConfig(supabase)
  const { start, end } = etWindowToday(config.drop_window_start_hour, config.drop_window_end_hour)
  const { data: drop } = await supabase
    .from('drops')
    .select('*')
    .gte('drop_at', start.toISOString())
    .lte('drop_at', end.toISOString())
    .maybeSingle<Drop>()

  if (!drop) {
    const windowLabel = `${formatHourLabel(config.drop_window_start_hour)}–${formatHourLabel(config.drop_window_end_hour)}`
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <WaitingCard windowLabel={windowLabel} />
      </div>
    )
  }

  const { data: profile } = await supabase.from('profiles').select('current_streak').eq('id', user.id).single()

  if (drop.type === 'hot_take') {
    const { data: details } = await supabase
      .from('hot_take_details')
      .select('option_a, option_b')
      .eq('drop_id', drop.id)
      .single()

    const { data: myVote } = await supabase
      .from('hot_take_votes')
      .select('choice')
      .eq('drop_id', drop.id)
      .eq('user_id', user.id)
      .maybeSingle()

    const counts = myVote ? await getHotTakeCounts(drop.id) : null

    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <HotTakeCard
          dropId={drop.id}
          prompt={drop.prompt}
          optionA={details?.option_a ?? 'Agree'}
          optionB={details?.option_b ?? 'Disagree'}
          initialChoice={(myVote?.choice as 'a' | 'b' | undefined) ?? null}
          initialCounts={counts}
          currentStreak={profile?.current_streak ?? null}
        />
      </div>
    )
  }

  // Caption and dare formats are being rebuilt for the new drop model —
  // next up after hot take ships.
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center gap-2">
      <p className="text-lg font-semibold">Today&apos;s a {drop.type === 'caption' ? 'caption' : 'dare'} drop</p>
      <p className="text-sm text-muted-foreground max-w-xs">This format is still being rebuilt — check back soon.</p>
    </div>
  )
}
