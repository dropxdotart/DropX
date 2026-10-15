import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSharedCampaign } from './actions'
import SharedReport from './SharedReport'

export const metadata: Metadata = { title: 'Campaign report · Rubble', robots: { index: false, follow: false } }

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const campaign = await getSharedCampaign(token)
  if (!campaign) notFound()
  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-8">
      <SharedReport token={token} campaign={campaign} />
    </div>
  )
}
