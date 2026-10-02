import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import PlayerManager from './PlayerManager'
import { listPlayers } from './actions'

export default async function PlayersAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Players" />
  const players = await listPlayers('')
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <PlayerManager initialPlayers={players} />
    </div>
  )
}
