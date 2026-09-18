import { Clock } from 'lucide-react'

export default function WaitingCard({ windowLabel }: { windowLabel: string }) {
  return (
    <div className="w-full max-w-sm text-center space-y-3">
      <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
        <Clock className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Today&apos;s drop is coming</p>
        <p className="text-sm text-muted-foreground">Sometime between {windowLabel} — check back soon.</p>
      </div>
    </div>
  )
}
