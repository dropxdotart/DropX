import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import PlayerManager from './PlayerManager'
import { listPlayers } from './actions'

export default async function PlayersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isAdminSession())) return <PasswordGate title="Players" />
  const q = (await searchParams).q ?? ''
  const players = await listPlayers(q)
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <PlayerManager initialPlayers={players} initialSearch={q} />
    </div>
  )
}
