import { Users, ListChecks, ShieldCheck, History, Settings } from 'lucide-react'

export const ADMIN_NAV_ITEMS = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/challenges', label: 'Challenges', icon: ListChecks },
  { href: '/admin/moderation', label: 'Moderation', icon: ShieldCheck },
  { href: '/admin/audit', label: 'Audit', icon: History },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
] as const
