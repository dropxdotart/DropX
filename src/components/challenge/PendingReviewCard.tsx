'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock } from 'lucide-react'

export default function PendingReviewCard({ photoUrl }: { photoUrl: string }) {
  return (
    <Card className="w-full max-w-sm text-center border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="w-full aspect-square bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no known dimensions */}
        <img src={photoUrl} alt="Your submission" className="w-full h-full object-cover" />
      </div>
      <CardHeader>
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-white/5 p-3 glow-orange animate-pulse-glow">
            <Clock className="w-6 h-6 text-[color:var(--neon-orange)]" />
          </div>
        </div>
        <CardTitle className="text-lg">Submitted — under review</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          A mod will approve or deny it shortly. It&apos;s already visible in the feed.
        </p>
      </CardContent>
    </Card>
  )
}
