'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — easy to read aloud/text

// The whole "auth" flow: no email/password, just a name, asked for at the
// point someone actually starts or joins a room (see GamePicker and
// HomeActions) rather than gating the home page up front. Runs server-side
// (not the client calling signInAnonymously() + updating the profile
// directly) specifically so the banned-word check can't be bypassed by a
// modified client; the anonymous session itself gets created here too,
// since @supabase/ssr's server client persists it via response cookies same
// as any other sign-in.
//
// A caller who's already signed in with a nickname keeps it — `nicknameInput`
// is only consulted for a brand-new identity, so re-hosting/re-joining never
// re-prompts.
async function ensureIdentity(nicknameInput?: string) {
  const supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
    if (profile?.username) return { supabase, user }
  }

  const trimmed = (nicknameInput ?? '').trim()
  if (!trimmed) throw new Error('Enter a name')
  if (trimmed.length > 24) throw new Error('Keep it under 24 characters')

  const admin = createAdminClient()
  const { data: banned } = await admin.from('banned_words').select('word')
  const lower = trimmed.toLowerCase()
  const hit = (banned ?? []).some((b) => lower.includes(b.word.toLowerCase()))
  if (hit) throw new Error("That name isn't allowed — try another")

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw new Error(error.message)
    user = data.user
  }
  if (!user) throw new Error('Could not start a session')

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ username: trimmed, display_name: trimmed })
    .eq('id', user.id)
  if (profileError) throw new Error(profileError.message)

  return { supabase, user }
}

function randomCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}

// Retries on the rare collision (unique constraint on rooms.code) rather
// than checking existence first — cheaper, and race-safe if two hosts hit
// this at the exact same moment.
export async function createRoom(gameKey: string, nickname?: string): Promise<never> {
  const { supabase, user } = await ensureIdentity(nickname)

  const { data: game } = await supabase.from('games').select('key').eq('key', gameKey).eq('available', true).maybeSingle()
  if (!game) throw new Error('That game isn’t available right now')

  let code = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    code = randomCode()
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ code, host_id: user.id, game_key: gameKey })
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

export async function joinRoom(codeInput: string, nickname?: string): Promise<never> {
  const { supabase, user } = await ensureIdentity(nickname)

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
