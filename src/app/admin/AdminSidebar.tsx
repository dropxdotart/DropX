'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS } from './navItems'

// Desktop-only (see AdminHeader for the mobile equivalent) — a fixed
// back-office sidebar, deliberately unlike the consumer app's bottom tab
// bar, so this reads as a separate tool rather than a themed app screen.
export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden sm:flex sm:w-56 sm:shrink-0 sm:flex-col sm:h-screen sm:sticky sm:top-0 border-r border-border bg-card">
      <div className="px-4 py-5 border-b border-border">
        <p className="text-sm font-semibold tracking-tight text-foreground">DropX</p>
        <p className="text-xs text-muted-foreground">Admin console</p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-2 py-3 border-t border-border">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to app
        </Link>
      </div>
    </aside>
  )
}
