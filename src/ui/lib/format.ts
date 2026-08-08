import { parseDbDate } from "@/lib/dates"

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = parseDbDate(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function initials(name: string | null, email: string): string {
  const source = name?.trim() || email
  const parts = source.split(/[\s,@.]+/).filter(Boolean)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}
