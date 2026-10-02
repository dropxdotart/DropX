import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import LiveManager from './LiveManager'
import { listLive } from './actions'

export default async function LiveAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Events & messages" />
  const data = await listLive()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <LiveManager initial={data} />
    </div>
  )
}
