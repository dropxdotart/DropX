'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/challenges', label: 'Challenges' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/settings', label: 'Settings' },
] as const

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 mt-3 border-b border-white/10">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-3 py-2 text-sm border-b-2 transition-colors',
              active ? 'text-foreground border-foreground/60' : 'text-muted-foreground border-transparent hover:text-foreground hover:border-white/20'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
