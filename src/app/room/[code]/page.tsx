import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoomRealtimeSync from '@/components/room/RoomRealtimeSync'
import Lobby from '@/components/room/Lobby'
import HotTakeRound from '@/components/room/HotTakeRound'
import FinalScores from '@/components/room/FinalScores'
import type { Round, RoomPlayer } from '@/lib/types'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: codeParam } = await params
  const code = codeParam.toUpperCase()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: room } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle()
  if (!room) notFound()

  // Visiting a room link you were sent auto-joins you — same convenience as
  // typing the code in on the home page, one less step.
  const { data: myMembership } = await supabase
    .from('room_players')
    .select('user_id')
    .eq('room_id', room.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!myMembership) {
    if (room.status === 'finished') notFound()
    await supabase.from('room_players').insert({ room_id: room.id, user_id: user.id })
  }

  const { data: players } = await supabase
    .from('room_players')
    .select('*, profiles(id, username, display_name, avatar_url)')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true })

  const currentRound =
    room.status === 'in_round'
      ? (
          await supabase
            .from('rounds')
            .select('*')
            .eq('room_id', room.id)
            .eq('round_index', room.current_round_index)
            .single()
        ).data
      : null

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <RoomRealtimeSync roomId={room.id} />
      <div className="w-full max-w-sm">
        {room.status === 'lobby' && (
          <Lobby room={room} players={(players ?? []) as unknown as RoomPlayer[]} isHost={room.host_id === user.id} />
        )}

        {room.status === 'in_round' && currentRound && (
          <>
            {currentRound.type === 'hot_take' ? (
              <HotTakeRound round={currentRound as unknown as Round} />
            ) : (
              <div className="text-center space-y-2 py-16">
                <p className="text-lg font-semibold">This round type isn&apos;t built yet</p>
                <p className="text-sm text-muted-foreground">{currentRound.type} is coming soon.</p>
              </div>
            )}
          </>
        )}

        {room.status === 'finished' && (
          <FinalScores players={(players ?? []) as unknown as RoomPlayer[]} />
        )}
      </div>
    </div>
  )
}
