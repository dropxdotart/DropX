import { Hammer } from 'lucide-react'

// Shown in place of the whole app to any signed-in non-admin — see
// RootLayout. Deliberately full-page, no nav: there's nothing else for a
// blocked user to navigate to right now.
export default function MaintenanceScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center gap-5">
      <div className="rounded-full bg-secondary p-4">
        <Hammer className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <span className="inline-block rounded-full bg-[color:var(--neon-orange)]/15 text-[color:var(--neon-orange)] text-xs font-bold tracking-wide uppercase px-3 py-1">
          Working on something new
        </span>
        <h1 className="text-2xl font-bold">DropX is getting rebuilt</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          We&apos;re redesigning the app from the ground up. Check back soon.
        </p>
      </div>
    </div>
  )
}
