import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GamePicker from '@/components/home/GamePicker'

export default async function HostPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Choose a game</h1>
          <p className="text-sm text-muted-foreground">Everyone in the room plays this one.</p>
        </div>
        <GamePicker />
      </div>
    </div>
  )
}
