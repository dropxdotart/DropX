import { isAdminSession } from '../../auth'
import PasswordGate from '../../PasswordGate'
import CampaignEditor from '../CampaignEditor'
import { EMPTY_CAMPAIGN } from '../shared'

export default async function NewCampaignPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Ads admin" />
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-6">
      <div className="w-full max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold">New campaign</h1>
          <p className="text-sm text-muted-foreground">Set where, when and to whom it runs — you&apos;ll add its images and videos next.</p>
        </div>
        <CampaignEditor id={null} initial={EMPTY_CAMPAIGN} />
      </div>
    </div>
  )
}
