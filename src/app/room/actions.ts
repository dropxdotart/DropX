'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// A small built-in content bank so a host can hit "Start" with zero setup —
// there's no authoring UI yet (that's next, once all three round types have
// a real in-round experience worth authoring content for). Only hot_take
// rounds for now since it's the only type with a built interface; who_said_it
// and caption prompts will join this bank once those round UIs exist.
const HOT_TAKE_BANK: { prompt: string; optionA: string; optionB: string }[] = [
  { prompt: 'Pineapple belongs on pizza', optionA: 'Agree', optionB: 'Disagree' },
  { prompt: 'A hot dog is a sandwich', optionA: 'Agree', optionB: 'Disagree' },
  { prompt: 'Cereal is a soup', optionA: 'Agree', optionB: 'Disagree' },
  { prompt: 'Cats or dogs', optionA: 'Cats', optionB: 'Dogs' },
  { prompt: 'Morning person or night owl', optionA: 'Morning', optionB: 'Night owl' },
  { prompt: 'It’s fine to text your ex', optionA: 'Agree', optionB: 'Disagree' },
]

function pickRounds(count: number) {
  const shuffled = [...HOT_TAKE_BANK].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

async function requireHost(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const { data: room } = await supabase.from('rooms').select('host_id, code').eq('id', roomId).single()
  if (!room || room.host_id !== user.id) throw new Error('Only the host can do that')
  return { supabase, code: room.code }
}

export async function startGame(roomId: string): Promise<void> {
  const { supabase, code } = await requireHost(roomId)

  const picks = pickRounds(3)
  const { error: roundsError } = await supabase.from('rounds').insert(
    picks.map((p, i) => ({
      room_id: roomId,
      round_index: i,
      type: 'hot_take' as const,
      prompt: p.prompt,
      option_a: p.optionA,
      option_b: p.optionB,
      status: i === 0 ? 'answering' : 'pending',
      started_at: i === 0 ? new Date().toISOString() : null,
    }))
  )
  if (roundsError) throw new Error(roundsError.message)

  const { error: roomError } = await supabase
    .from('rooms')
    .update({ status: 'in_round', current_round_index: 0 })
    .eq('id', roomId)
  if (roomError) throw new Error(roomError.message)

  revalidatePath(`/room/${code}`)
}

// Advances to the next round, or ends the game if that was the last one.
// Any player can trigger this (not host-gated at the application level) so
// the room isn't stuck if the host's connection drops mid-round — but the
// actual writes still run on the user-scoped client, so RLS's host-only
// update policies on rooms/rounds mean only the host's click can actually
// take effect right now. Fine for a v1 with one host-authored game; a
// non-host "move on" control needs its own RLS allowance (or a service-role
// action) once that's a real feature.
export async function nextRound(roomId: string, fromIndex: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { data: room, error: roomLookupError } = await supabase.from('rooms').select('code').eq('id', roomId).single()
  if (roomLookupError) throw new Error(roomLookupError.message)
  if (!room) throw new Error('Room not found')

  const { count, error: countError } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if (countError) throw new Error(countError.message)

  const nextIndex = fromIndex + 1
  if (count !== null && nextIndex >= count) {
    const { error } = await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
    if (error) throw new Error(error.message)
    revalidatePath(`/room/${room.code}`)
    return
  }

  const { data: updatedRound, error: roundError } = await supabase
    .from('rounds')
    .update({ status: 'answering', started_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('round_index', nextIndex)
    .select('id')
    .maybeSingle()
  if (roundError) throw new Error(roundError.message)
  if (!updatedRound) throw new Error(`nextRound: no round matched room_id=${roomId} round_index=${nextIndex}`)

  const { data: updatedRoom, error: advanceError } = await supabase
    .from('rooms')
    .update({ current_round_index: nextIndex })
    .eq('id', roomId)
    .select('id')
    .maybeSingle()
  if (advanceError) throw new Error(advanceError.message)
  if (!updatedRoom) throw new Error(`nextRound: no room matched id=${roomId}`)

  revalidatePath(`/room/${room.code}`)
}

export async function castHotTakeVote(roundId: string, choice: 'a' | 'b'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { error } = await supabase.from('hot_take_votes').insert({ round_id: roundId, user_id: user.id, choice })
  if (error && error.code !== '23505') throw new Error(error.message)
}

export async function getMyHotTakeVote(roundId: string): Promise<'a' | 'b' | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('hot_take_votes').select('choice').eq('round_id', roundId).eq('user_id', user.id).maybeSingle()
  return (data?.choice as 'a' | 'b' | undefined) ?? null
}

export async function getHotTakeCounts(roundId: string): Promise<{ a: number; b: number }> {
  const supabase = await createClient()
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('hot_take_votes').select('user_id', { count: 'exact', head: true }).eq('round_id', roundId).eq('choice', 'a'),
    supabase.from('hot_take_votes').select('user_id', { count: 'exact', head: true }).eq('round_id', roundId).eq('choice', 'b'),
  ])
  return { a: a ?? 0, b: b ?? 0 }
}

// Any player can trigger the reveal once they're ready to see results —
// same "don't get stuck if the host vanishes" reasoning as nextRound.
export async function revealRound(roundId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')

  const { data: round, error: roundLookupError } = await supabase.from('rounds').select('room_id').eq('id', roundId).single()
  if (roundLookupError) throw new Error(roundLookupError.message)
  if (!round) throw new Error('Round not found')

  const { data: updated, error } = await supabase
    .from('rounds')
    .update({ status: 'revealed' })
    .eq('id', roundId)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!updated) throw new Error(`Reveal update matched no row for round ${roundId} (RLS or bad id)`)

  const { data: room } = await supabase.from('rooms').select('code').eq('id', round.room_id).single()
  if (room) revalidatePath(`/room/${room.code}`)
}
