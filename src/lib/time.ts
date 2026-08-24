const ET = 'America/New_York'

// UTC-minus-ET offset (minutes) at a given instant, DST-aware. Formats the
// instant into ET wall-clock fields, reinterprets those fields as UTC, and
// diffs against the real instant — a standard dependency-free technique for
// converting between an IANA zone's civil time and an absolute instant.
function etOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]))
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return (asUTC - date.getTime()) / 60000
}

// Returns today's [start, end) window (as absolute instants) for the given
// ET hour range, e.g. etWindowToday(12, 19) for 12PM–7PM Eastern today.
export function etWindowToday(startHour: number, endHour: number) {
  const now = new Date()
  const offset = etOffsetMinutes(now)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value]))
  const y = Number(parts.year), m = Number(parts.month) - 1, d = Number(parts.day)
  const start = new Date(Date.UTC(y, m, d, startHour, 0, 0) - offset * 60000)
  const end = new Date(Date.UTC(y, m, d, endHour, 0, 0) - offset * 60000)
  return { start, end, now }
}

// Today's ET calendar date as 'YYYY-MM-DD', for matching against a
// `date` column (e.g. challenges.scheduled_date) — deliberately not derived
// from a UTC Date's own getters, since a scheduled_date is a civil date in
// ET, not a UTC one.
export function etDateToday(): string {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: ET })
  return dtf.format(new Date())
}

// Formats a 24h hour (0-23) as a short 12h label, e.g. 12 -> "12 PM", 19 -> "7 PM".
export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12
  return `${twelveHour} ${period}`
}

// Short relative-time label for feed timestamps, e.g. "5m ago", "3h ago".
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const steps: [number, string][] = [
    [60, 's'], [60, 'm'], [24, 'h'], [7, 'd'], [4.345, 'w'], [12, 'mo'], [Infinity, 'y'],
  ]
  let value = seconds
  for (const [factor, unit] of steps) {
    if (value < factor || factor === Infinity) return `${Math.max(1, Math.floor(value))}${unit} ago`
    value /= factor
  }
  return 'just now'
}
