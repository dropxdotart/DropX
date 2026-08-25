// The fixed set of badges an admin can grant. Includes "OG", already set on
// a real account before this list existed, so that badge stays visible and
// editable instead of becoming a hidden, unsaveable value.
export const AVAILABLE_BADGES = ['OG', 'Founder', 'Beta Tester', 'Verified', 'Bug Hunter', 'Top Streaker'] as const

export type Badge = (typeof AVAILABLE_BADGES)[number]
