import { createClient } from '@/lib/supabase/server'
import HomeActions from '@/components/home/HomeActions'
import NicknameGate from '@/components/home/NicknameGate'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let hasNickname = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single()
    hasNickname = Boolean(profile?.username)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Party games with your friends</h1>
          <p className="text-sm text-muted-foreground">Hot takes, who-said-it, and caption battles — all live, all on your phones.</p>
        </div>
        {user && hasNickname ? <HomeActions /> : <NicknameGate />}
      </div>
    </div>
  )
}
