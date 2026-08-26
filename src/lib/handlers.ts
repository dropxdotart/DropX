// Grants access to /handlers (creating and posting as bot accounts): any
// mod/admin, or anyone specifically given the "Handler" badge without
// needing full mod powers.
export function isHandler(profile: { role: string; badges: string[] } | null | undefined): boolean {
  if (!profile) return false
  return profile.role === 'mod' || profile.role === 'admin' || profile.badges.includes('Handler')
}
