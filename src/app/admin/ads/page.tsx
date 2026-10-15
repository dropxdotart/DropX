import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import AdsOverview from './AdsOverview'
import { getAdSettings, listCampaigns } from './actions'

export default async function AdsAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Ads admin" />
  const [{ campaigns, creatives }, settings] = await Promise.all([listCampaigns(), getAdSettings()])
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-6">
      <AdsOverview campaigns={campaigns} creatives={creatives} settings={settings} />
    </div>
  )
}
