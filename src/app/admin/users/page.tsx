import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
              <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                <td className="p-2.5">
                  <UserDetailDialog userId={u.id} name={u.display_name ?? u.username ?? 'Someone'} username={u.username} />
                </td>
                <td className="p-2.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'capitalize text-[10px] px-1.5 py-0',
                      u.role === 'admin' && 'border-[color:var(--neon-violet)]/40 text-[color:var(--neon-violet)]',
                      u.role === 'mod' && 'border-[color:var(--neon-cyan)]/40 text-[color:var(--neon-cyan)]',
                      u.role === 'user' && 'border-white/15 text-muted-foreground'
                    )}
                  >
                    {u.role}
                  </Badge>
                </td>
                <td className="p-2.5">
                  {u.badges && u.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {u.badges.slice(0, 3).map((b: string) => (
                        <Badge key={b} variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">{b}</Badge>
                      ))}
                      {u.badges.length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">+{u.badges.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-2.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'capitalize text-[10px] px-1.5 py-0',
                      u.account_status !== 'active' ? 'border-destructive/40 text-destructive' : 'border-white/15 text-muted-foreground'
                    )}
                  >
                    {u.account_status}
                  </Badge>
                </td>
                <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                  {new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
