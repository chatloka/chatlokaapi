export function parseDbDate(value: string): Date {
  const trimmed = value.trim()
  const isSqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(trimmed)
  if (isSqliteUtc) return new Date(trimmed.replace(" ", "T") + "Z")
  return new Date(trimmed)
}

export function toWIB(dateStr: string | null): string {
  if (!dateStr) return "-"
  const d = parseDbDate(dateStr)
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}
