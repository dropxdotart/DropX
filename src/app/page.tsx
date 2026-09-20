import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HomeActions from '@/components/home/HomeActions'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Party games with your friends</h1>
          <p className="text-sm text-muted-foreground">Hot takes, who-said-it, and caption battles — all live, all on your phones.</p>
        </div>
        <HomeActions />
      </div>
    </div>
  )
}
