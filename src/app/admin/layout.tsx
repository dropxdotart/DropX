import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const TABS = [
  { href: '/admin/challenges', label: 'Challenges' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/settings', label: 'Settings' },
] as const

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="flex-1 px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="font-heading text-lg font-bold tracking-wide">Admin</h1>
          <nav className="flex items-center gap-1 mt-3 border-b border-white/10">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-white/20 transition-colors"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </div>
  )
}
