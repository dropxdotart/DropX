// The fixed set of badges an admin can grant. Includes "OG", already set on
// a real account before this list existed, so that badge stays visible and
// editable instead of becoming a hidden, unsaveable value.
//
// "Handler" is the one badge that isn't purely cosmetic — it also grants
// access to /handlers (posting as a bot account), same as being mod/admin.
// See src/lib/handlers.ts.
export const AVAILABLE_BADGES = ['OG', 'Founder', 'Beta Tester', 'Verified', 'Bug Hunter', 'Top Streaker', 'Handler'] as const

export type Badge = (typeof AVAILABLE_BADGES)[number]
