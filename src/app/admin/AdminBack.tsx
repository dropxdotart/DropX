'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// "← Admin" at the top of every admin tool page (not the admin home).
export default function AdminBack() {
  const pathname = usePathname()
  if (pathname === '/admin') return null
  // The ads tool is wider (tables and charts).
  const wide = pathname.startsWith('/admin/ads')
  return (
    <div className={`mx-auto w-full px-4 pt-4 ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 rounded-full py-1.5 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Admin
      </Link>
    </div>
  )
}
