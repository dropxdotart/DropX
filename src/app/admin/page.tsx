import { isAdminSession } from './auth'
import Link from 'next/link'
import PasswordGate from './PasswordGate'

const TOOLS = [
  { href: '/admin/ads', label: 'Ads', description: 'Upload and manage rewarded/interstitial/banner creative' },
]

export default async function AdminIndexPage() {
  const authed = await isAdminSession()

  if (!authed) return <PasswordGate title="Admin" />

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">Admin</h1>
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
