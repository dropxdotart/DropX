import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from './AdminSidebar'
import AdminHeader from './AdminHeader'
import AdminFontScope from './AdminFontScope'

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
    <div className="admin-scope flex flex-1 bg-background text-foreground">
      <AdminFontScope />
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <AdminHeader />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">{children}</div>
      </div>
    </div>
  )
}
