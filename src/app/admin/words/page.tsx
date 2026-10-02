import { isAdminSession } from '../auth'
import PasswordGate from '../PasswordGate'
import WordManager from './WordManager'
import { flaggedPlayers, listBannedWords } from '../players/actions'

export default async function WordsAdminPage() {
  if (!(await isAdminSession())) return <PasswordGate title="Banned words" />
  const [words, flagged] = await Promise.all([listBannedWords(), flaggedPlayers()])
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <WordManager initialWords={words} initialFlagged={flagged} />
    </div>
  )
}
