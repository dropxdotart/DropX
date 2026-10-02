// Username rules and the offensive-word check, used by the game's
// setUsername action and by admin renames. Admins add their own words in
// the banned_words table; this built-in list is the baseline.

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,16}$/

const BUILT_IN = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'whore', 'slut',
  'bastard', 'asshole', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'rapist', 'nazi',
  'hitler', 'kike', 'spic', 'chink', 'tranny', 'porn', 'sex', 'cum', 'jizz', 'twat', 'wank',
  'ass', 'tits', 'boob', 'dildo', 'anal', 'molest', 'pedo', 'kys',
]

// Undo common disguises: case, l33t digits/symbols, and separators.
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
}

// True if the name contains a banned word. Short words (3 letters or
// fewer) only count as a whole part of the name, so "Classic" isn't
// caught by "ass"; longer words count anywhere in it.
export function containsBannedWord(name: string, extra: string[]): boolean {
  const n = normalize(name)
  const joined = n.replace(/_/g, '')
  const parts = n.split('_').filter(Boolean)
  for (const raw of [...BUILT_IN, ...extra]) {
    const w = normalize(raw.trim()).replace(/[^a-z]/g, '')
    if (!w) continue
    if (w.length <= 3 ? parts.includes(w) || joined === w : joined.includes(w)) return true
  }
  return false
}

// Checks a requested name; returns a message for the player, or null if ok
// (uniqueness is checked when it's saved).
export function usernameProblem(name: string, extra: string[]): string | null {
  if (!USERNAME_RULE.test(name)) return 'Use 3–16 letters, numbers or _'
  if (containsBannedWord(name, extra)) return "That name isn't allowed — try another"
  return null
}
