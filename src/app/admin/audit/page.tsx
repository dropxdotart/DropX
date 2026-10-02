import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import AuditList from './AuditList'
import { listAudit } from '../statsActions'

export default async function AuditPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Audit log" />
  const rows = await listAudit()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <AuditList initial={rows} />
    </div>
  )
}
