import Game from '@/components/game/Game'
import BuildingScreen from '@/components/game/BuildingScreen'
import { isAdminSession } from './admin/auth'
import { isMaintenanceOn } from '@/lib/maintenance'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if ((await isMaintenanceOn()) && !(await isAdminSession())) return <BuildingScreen />
  return <Game />
}
