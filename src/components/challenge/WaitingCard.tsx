'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap } from 'lucide-react'

const POLL_MS = 45_000

// The drop time is intentionally random within the window, so this never
// shows a countdown to an exact moment — it just quietly checks back.
export default function WaitingCard() {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(interval)
  }, [router])

  return (
    <Card className="w-full max-w-sm text-center border-white/10 bg-card/60 backdrop-blur-sm">
      <CardHeader>
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-white/5 p-4 glow-violet animate-pulse-glow">
            <Zap className="w-8 h-8 text-[color:var(--neon-violet)]" fill="currentColor" />
          </div>
        </div>
        <CardTitle className="text-lg">Today&apos;s challenge hasn&apos;t dropped yet</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          It drops sometime between 12–7 PM ET. Check back — this page will update on its own.
        </p>
      </CardContent>
    </Card>
  )
}
