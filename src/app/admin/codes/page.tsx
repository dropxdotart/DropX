import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import CodeManager from './CodeManager'
import { listCodes } from './actions'

export default async function CodesAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Redeem codes" />
  const codes = await listCodes()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <CodeManager initialCodes={codes} />
    </div>
  )
}
