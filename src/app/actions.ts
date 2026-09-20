'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — easy to read aloud/text

function randomCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}

// Retries on the rare collision (unique constraint on rooms.code) rather
// than checking existence first — cheaper, and race-safe if two hosts hit
// this at the exact same moment.
export async function createRoom(): Promise<never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to start a room')

  let code = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    code = randomCode()
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ code, host_id: user.id })
      .select('id, code')
      .single()

    if (!error && room) {
      await supabase.from('room_players').insert({ room_id: room.id, user_id: user.id })
      redirect(`/room/${room.code}`)
    }
    if (error && error.code !== '23505') throw new Error(error.message)
  }
  throw new Error('Could not generate a room code — try again')
}

export async function joinRoom(codeInput: string): Promise<never> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to join a room')

  const code = codeInput.trim().toUpperCase()
  if (!code) throw new Error('Enter a room code')

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, code, status')
    .eq('code', code)
    .maybeSingle()

  if (roomError) throw new Error(roomError.message)
  if (!room) throw new Error('No room with that code')
  if (room.status === 'finished') throw new Error('That room already ended')

  const { error: joinError } = await supabase
    .from('room_players')
    .insert({ room_id: room.id, user_id: user.id })

  // Already in the room (re-joining, e.g. after a refresh) — fine, not an error.
  if (joinError && joinError.code !== '23505') throw new Error(joinError.message)

  redirect(`/room/${room.code}`)
}
