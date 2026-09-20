// Short relative-time label, e.g. "5m ago", "3h ago".
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
