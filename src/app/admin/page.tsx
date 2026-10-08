import { isAdminSession } from './auth'
import Link from 'next/link'
import PasswordGate from './PasswordGate'
import Dashboard from './Dashboard'
import { getDashboard } from './statsActions'

const TOOLS = [
  { href: '/admin/maintenance', label: 'Maintenance', description: 'Switch the game off (“Sorry, building!”) while it’s being worked on' },
  { href: '/admin/ads', label: 'Ads', description: 'Upload ads, pick where they run, see their stats' },
  { href: '/admin/buildings', label: 'Buildings', description: 'Design your own buildings for players to demolish' },
  { href: '/admin/live', label: 'Events & messages', description: 'Double bricks, sales, messages and gifts for every player' },
  { href: '/admin/codes', label: 'Redeem codes', description: 'Create codes that give bricks, boosts or free upgrades' },
  { href: '/admin/players', label: 'Players', description: 'Look up players, rename them, set balances, send gifts' },
  { href: '/admin/words', label: 'Banned words', description: 'Words players can’t use in their usernames' },
  { href: '/admin/audit', label: 'Audit log', description: 'Every change made in the admin panel, newest first' },
]

export default async function AdminIndexPage() {
  const authed = await isAdminSession()

  if (!authed) return <PasswordGate title="Admin" />
  const data = await getDashboard()

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg space-y-3">
        <h1 className="text-lg font-semibold">Admin</h1>
        <Dashboard data={data} />
        <h2 className="pt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tools</h2>
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="block rounded-xl border border-border bg-card p-4 hover:border-foreground/30 hover:bg-accent transition-colors"
          >
            <p className="font-medium">{tool.label}</p>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
