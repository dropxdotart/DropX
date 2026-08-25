import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('profiles')
    .select('id, username, display_name, role, current_streak, strike_count, account_status')
    .order('created_at', { ascending: false })
    .limit(100)

  if (q) query = query.ilike('username', `%${q}%`)

  const { data: users } = await query

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="/admin/users">
        <Input name="q" defaultValue={q ?? ''} placeholder="Search by @username" className="max-w-xs" />
      </form>

      <div className="rounded-xl border border-white/10 bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-muted-foreground">
              <th className="p-2.5 font-medium">Name</th>
              <th className="p-2.5 font-medium">Role</th>
              <th className="p-2.5 font-medium">Streak</th>
              <th className="p-2.5 font-medium">Strikes</th>
              <th className="p-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                <td className="p-2.5">
                  <Link href={`/admin/users/${u.id}`} className="hover:underline">
                    <span className="font-medium text-white">{u.display_name ?? u.username ?? 'Someone'}</span>
                    {u.username && <span className="text-muted-foreground ml-1.5">@{u.username}</span>}
                  </Link>
                </td>
                <td className="p-2.5">
                  {u.role !== 'user' ? (
                    <Badge className="capitalize border-0 gradient-hero text-white text-[10px] px-1.5 py-0">{u.role}</Badge>
                  ) : (
                    <Badge variant="secondary" className="capitalize text-[10px] px-1.5 py-0 text-muted-foreground">User</Badge>
                  )}
                </td>
                <td className="p-2.5 text-muted-foreground tabular-nums">{u.current_streak}</td>
                <td className="p-2.5 text-muted-foreground tabular-nums">{u.strike_count}</td>
                <td className="p-2.5">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'capitalize text-[10px] px-1.5 py-0',
                      u.account_status !== 'active' ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {u.account_status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
