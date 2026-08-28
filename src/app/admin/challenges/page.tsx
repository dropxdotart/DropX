import { Hammer } from 'lucide-react'

// The whole challenge system (this page included) is getting rebuilt from
// scratch as its own project — not worth reskinning the old version for
// the admin redesign just to tear it out again shortly after. The old
// implementation (calendar, form, row detail) is still on disk, just
// unlinked, until the redesign replaces it for real.
export default function AdminChallengesPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-20 text-center">
      <div className="rounded-full bg-muted p-3">
        <Hammer className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Work happening</p>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">
          The challenge system is being redesigned from the ground up — this page is on hold until that lands.
        </p>
      </div>
    </div>
  )
}
