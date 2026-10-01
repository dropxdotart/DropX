export function formatNumber(n: number) {
  const v = Math.floor(n)
  if (v < 10_000) return v.toLocaleString()
  const units = ['K', 'M', 'B', 'T']
  let unit = -1
  let x = v
  while (x >= 1000 && unit < units.length - 1) {
    x /= 1000
    unit++
  }
  return `${x.toFixed(x < 100 ? 1 : 0)}${units[unit]}`
}
