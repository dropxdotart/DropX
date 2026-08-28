'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS } from './navItems'

// The page title, plus (mobile only, <sm) a horizontal scrollable strip
// standing in for AdminSidebar, which is desktop-only.
export default function AdminHeader() {
  const pathname = usePathname()
  const active = ADMIN_NAV_ITEMS.find((i) => pathname === i.href || pathname?.startsWith(i.href + '/'))

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">{active?.label ?? 'Admin'}</h1>
        <Link
          href="/"
          className="sm:hidden flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          App
        </Link>
      </div>
      <nav className="flex sm:hidden gap-1.5 px-4 pb-3 overflow-x-auto">
        {ADMIN_NAV_ITEMS.map((item) => {
          const itemActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                itemActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
