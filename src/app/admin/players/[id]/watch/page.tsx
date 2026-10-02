import { isAdminSession } from '../../../auth'
import PasswordGate from '../../../PasswordGate'
import { getPlayerSave } from '../../actions'
import Watch from './Watch'

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return <PasswordGate title="Watch player" />
  const { id } = await params
  const data = await getPlayerSave(id)
  if (!data) return <p className="p-10 text-center text-sm text-muted-foreground">Player not found.</p>
  return <Watch playerId={id} initial={data} />
}
