import Link from 'next/link'
import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import { isMaintenanceOn } from '@/lib/maintenance'
import MaintenanceToggle from './MaintenanceToggle'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
  if (!(await isAdminSession())) return <PasswordGate title="Maintenance" />
  const on = await isMaintenanceOn()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg space-y-3">
        <Link href="/admin" className="text-sm text-muted-foreground">
          ← Admin
        </Link>
        <h1 className="text-lg font-semibold">Maintenance</h1>
        <MaintenanceToggle initial={on} />
      </div>
    </div>
  )
}
