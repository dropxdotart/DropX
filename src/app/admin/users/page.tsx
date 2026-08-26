import { createClient } from '@/lib/supabase/server'
import { Input } from '@/components/ui/input'
import UserDetailDialog from './UserDetailDialog'
import CreateUserDialog from './CreateUserDialog'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select('id, username, display_name, role, badges, account_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (q) query = query.ilike('username', `%${q}%`)

  const { data: users } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <form className="flex gap-2" action="/admin/users">
          <Input name="q" defaultValue={q ?? ''} placeholder="Search by @username" className="max-w-xs" />
        </form>
        <CreateUserDialog />
      </div>

      <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
              <th className="p-2.5 font-medium">Name</th>
              <th className="p-2.5 font-medium">Role</th>
              <th className="p-2.5 font-medium">Badges</th>
              <th className="p-2.5 font-medium">Status</th>
              <th className="p-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <UserDetailDialog
                key={u.id}
                userId={u.id}
                name={u.display_name ?? u.username ?? 'Someone'}
                username={u.username}
                role={u.role}
                badges={u.badges ?? []}
                accountStatus={u.account_status}
                joined={new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
