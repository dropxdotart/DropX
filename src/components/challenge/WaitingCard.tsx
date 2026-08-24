'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const POLL_MS = 45_000

// The drop time is intentionally random within the window, so this never
// shows a countdown to an exact moment — it just quietly checks back.
export default function WaitingCard({ windowLabel }: { windowLabel: string }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(interval)
  }, [router])

  return (
    <Card className="w-full max-w-sm text-center border-white/10 bg-card/60 backdrop-blur-sm">
      <CardHeader>
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-white/5 p-3 glow-violet animate-pulse-glow">
            <Image src="/dropx-icon.png" alt="" width={32} height={32} />
          </div>
        </div>
        <CardTitle className="text-lg">Today&apos;s challenge hasn&apos;t dropped yet</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          It drops sometime between {windowLabel} ET. Check back — this page will update on its own.
        </p>
      </CardContent>
    </Card>
  )
}
