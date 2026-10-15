'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AdCreative } from '@/app/actions'
import { fetchAd, trackAd } from '@/lib/adTracking'
import AdPlayer, { type AdPlayerHandle } from './AdPlayer'

// Watch-to-claim. The ad is loaded ahead of time so tapping the button can
// start it straight away — with sound, since it's started by the tap. The
// reward is given once it has played for the admin-set time (or a shorter
// video ends) and the player claims it; leaving early gives nothing.
export default function RewardedAdButton({
  onReward,
  onStart,
  onCancel,
  reward,
  rewardBricks = 0,
  className,
  children,
}: {
  onReward: () => void
  onStart?: () => void // the ad is opening
  onCancel?: () => void // left early, no reward
  // Shown in the ad: what the player gets, e.g. "+1,200 🧱".
  reward?: string
  // Logged with the completion as bricks given out through this ad.
  rewardBricks?: number
  className?: string
  children: ReactNode
}) {
  const [ad, setAd] = useState<AdCreative | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const player = useRef<AdPlayerHandle>(null)

  const load = () => {
    fetchAd('rewarded').then(setAd)
  }
  useEffect(load, [])

  const start = () => {
    if (open) return
    onStart?.()
    setOpen(true)
    if (ad) trackAd(ad, 'view')
    // Same tap, so the browser lets it play with sound.
    player.current?.start(true)
  }

  const close = (watched: boolean, seconds: number) => {
    if (ad) trackAd(ad, watched ? 'complete' : 'skip', { seconds, bricks: watched ? rewardBricks : 0 })
    setOpen(false)
    if (watched) onReward()
    else onCancel?.()
    // A fresh ad for next time (targeting and caps may have changed).
    load()
  }

  return (
    <>
      <button className={className} onClick={start} disabled={open || ad === undefined}>
        {children}
      </button>
      {ad !== undefined && <AdPlayer ref={player} ad={ad} open={open} mode="rewarded" reward={reward} onClose={close} />}
    </>
  )
}
