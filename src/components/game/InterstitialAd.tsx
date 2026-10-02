'use client'

import { useEffect, useRef, useState } from 'react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'
import AdPlayer, { type AdPlayerHandle } from './AdPlayer'

// Shown once per `trigger` value change (the caller bumps this — e.g. on
// every site cleared) rather than on a timer, so it lands at a natural
// break instead of interrupting active tapping. Full screen; it starts
// muted (it isn't started by a tap, so browsers block sound) with a "Tap
// for sound" button, and becomes skippable after the admin-set time or as
// soon as a shorter video ends.
export default function InterstitialAd({ trigger }: { trigger: number }) {
  const [ad, setAd] = useState<AdCreative | null>(null)
  const [open, setOpen] = useState(false)
  const initialTrigger = useRef(trigger)
  const player = useRef<AdPlayerHandle>(null)

  useEffect(() => {
    // Only show on a change after mount — not for the value a save loads with.
    if (trigger === initialTrigger.current) return
    let cancelled = false
    getAdByPlacement('interstitial').then((creative) => {
      if (cancelled || !creative) return
      setAd(creative)
      setOpen(true)
      trackAd(creative.id, 'view')
    })
    return () => {
      cancelled = true
    }
  }, [trigger])

  // Start once the player for this creative has mounted.
  useEffect(() => {
    if (open) player.current?.start(false)
  }, [open, ad])

  if (!ad) return null

  return (
    <AdPlayer
      ref={player}
      ad={ad}
      open={open}
      mode="interstitial"
      onClose={(watched) => {
        trackAd(ad.id, watched ? 'complete' : 'skip')
        setOpen(false)
        setAd(null)
      }}
    />
  )
}
