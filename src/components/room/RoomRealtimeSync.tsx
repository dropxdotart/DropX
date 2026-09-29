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

    // Starting a game inserts all 3 rounds plus updates the room row in
    // the same action — that's 4+ separate row-level change events landing
    // within milliseconds of each other. Refreshing on every single one
    // was causing a visible flicker (the whole page re-fetching several
    // times in a row); batching them into one refresh per short burst
    // fixes that without losing "live" responsiveness.
    let pending: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => router.refresh(), 150)
    }

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, refresh)
      .subscribe()

    return () => {
      if (pending) clearTimeout(pending)
      supabase.removeChannel(channel)
    }
  }, [roomId, router])

  return null
}
