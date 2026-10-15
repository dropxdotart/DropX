import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isAdminSession } from '../../auth'
import PasswordGate from '../../PasswordGate'
import CampaignView from '../CampaignView'
import { getCampaign } from '../actions'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return <PasswordGate title="Ads admin" />
  const { id } = await params
  const found = await getCampaign(id)
  if (!found) notFound()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-6">
      <Suspense>
        <CampaignView campaign={found.campaign} creatives={found.creatives} />
      </Suspense>
    </div>
  )
}
