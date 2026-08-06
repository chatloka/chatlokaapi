export function parseDbDate(value: string): Date {
  const trimmed = value.trim()
  const isSqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(trimmed)
  if (isSqliteUtc) return new Date(trimmed.replace(" ", "T") + "Z")
  return new Date(trimmed)
}
