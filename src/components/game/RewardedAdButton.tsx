'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'
import { trackAd } from '@/lib/adTracking'
import AdPlayer, { type AdPlayerHandle } from './AdPlayer'

// Watch-to-claim. The ad is loaded ahead of time so tapping the button can
// start it straight away — with sound, since it's started by the tap. It
// can't be closed until it has played for the admin-set time (or a shorter
// video ends); closing it after that gives the reward.
export default function RewardedAdButton({
  onReward,
  rewardBricks = 0,
  className,
  children,
}: {
  onReward: () => void
  // Recorded with the "watched" stat as bricks given out through this ad.
  rewardBricks?: number
  className?: string
  children: ReactNode
}) {
  const [ad, setAd] = useState<AdCreative | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const player = useRef<AdPlayerHandle>(null)

  const load = () => {
    getAdByPlacement('rewarded')
      .then(setAd)
      .catch(() => setAd(null))
  }
  useEffect(load, [])

  const start = () => {
    if (open) return
    setOpen(true)
    if (ad) trackAd(ad.id, 'view')
    // Same tap, so the browser lets it play with sound.
    player.current?.start(true)
  }

  const finish = () => {
    if (ad) trackAd(ad.id, 'complete', rewardBricks)
    setOpen(false)
    onReward()
    // A fresh ad for next time.
    load()
  }

  return (
    <>
      <button className={className} onClick={start} disabled={open || ad === undefined}>
        {children}
      </button>
      {ad !== undefined && <AdPlayer ref={player} ad={ad} open={open} mode="rewarded" onClose={finish} />}
    </>
  )
}
