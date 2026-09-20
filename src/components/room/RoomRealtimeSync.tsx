'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Drives every live update in a room (players joining, the host starting
// the game, round transitions, reveals) with one blunt tool: refetch the
// whole server-rendered page whenever anything relevant changes. No
// client-side state to keep in sync by hand — the server component is
// always the source of truth, this just tells Next.js when to ask it
// again. Fine-grained live state (e.g. a synced countdown) can layer on
// top of this later without changing the approach for everything else.
export default function RoomRealtimeSync({ roomId }: { roomId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, () => router.refresh())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, router])

  return null
}
