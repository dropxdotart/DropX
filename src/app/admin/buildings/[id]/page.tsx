import { notFound } from 'next/navigation'
import { isAdminSession } from '../../auth'
import PasswordGate from '../../PasswordGate'
import BuildingEditor from '../BuildingEditor'
import { loadBuilding } from '../actions'

export default async function BuildingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) return <PasswordGate title="Buildings" />
  const { id } = await params
  const initial = id === 'new' ? null : await loadBuilding(id)
  if (id !== 'new' && !initial) notFound()
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-6">
      <BuildingEditor key={initial?.updated_at ?? 'new'} initial={initial} />
    </div>
  )
}
