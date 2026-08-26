import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from './AdminNav'

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
          <AdminNav />
        </div>
        {children}
      </div>
    </div>
  )
}
