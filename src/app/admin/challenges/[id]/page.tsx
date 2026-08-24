import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChallengeForm from '../ChallengeForm'
import type { ChallengeAdmin } from '@/lib/types'

export default async function EditChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: challenge } = await supabase.from('challenges').select('*').eq('id', id).single()

  if (!challenge) notFound()

  return <ChallengeForm existing={challenge as ChallengeAdmin} />
}
