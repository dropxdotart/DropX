'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Gift } from 'lucide-react'
import { getAdByPlacement, type AdCreative } from '@/app/actions'

const WATCH_SECONDS = 5

export default function RewardedAdButton({ bonusLabel, onReward }: { bonusLabel: string; onReward: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'claim'>('idle')
  const [ad, setAd] = useState<AdCreative | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(WATCH_SECONDS)

  const start = async () => {
    setState('loading')
    const creative = await getAdByPlacement('rewarded')
    setAd(creative)
    setSecondsLeft(WATCH_SECONDS)
    setState('playing')

    let remaining = WATCH_SECONDS
    const id = setInterval(() => {
      remaining -= 1
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        setState('claim')
      }
    }, 1000)
  }

  const claim = () => {
    onReward()
    setState('idle')
    setAd(null)
  }

  return (
    <>
      <Button
        variant="secondary"
        className="w-full h-11 rounded-xl"
        onClick={start}
        disabled={state !== 'idle'}
      >
        {state === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gift className="w-4 h-4 mr-2" />}
        {bonusLabel}
      </Button>

      {(state === 'playing' || state === 'claim') && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6">
          <div className="w-full max-w-xs aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center">
            {ad ? (
              ad.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- external Storage URL
                <img src={ad.media_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={ad.media_url} className="w-full h-full object-cover" autoPlay muted playsInline />
              )
            ) : (
              <span className="text-sm text-muted-foreground">Ad</span>
            )}
          </div>

          {state === 'playing' ? (
            <p className="mt-4 text-sm text-white/70 font-mono">{secondsLeft}s</p>
          ) : (
            <Button className="mt-4 h-11 rounded-xl px-8" onClick={claim}>
              Claim reward
            </Button>
          )}
        </div>
      )}
    </>
  )
}
