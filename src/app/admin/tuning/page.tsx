import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import TuningEditor from './TuningEditor'
import { getTuning } from './actions'

export default async function TuningPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Game balance" />
  const tuning = await getTuning()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <TuningEditor initial={tuning} />
    </div>
  )
}
