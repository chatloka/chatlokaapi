import { Badge } from "@/components/ui/badge"

export type ContactBadgeType = "lead" | "customer" | null | undefined
export type SupportBadgeStatus = "active" | "expired" | "none" | null | undefined

export function ContactTypeBadge({ type }: { type: ContactBadgeType }) {
  if (type === "customer") {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-500 border-emerald-500/20" title="Sudah memiliki purchase code">
        Customer
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1 text-amber-600" title="Belum punya purchase code terdaftar">
      Lead
    </Badge>
  )
}

export function SupportStatusBadge({ status, supportUntil }: { status: SupportBadgeStatus; supportUntil?: string | null }) {
  if (status === "active") {
    return (
      <Badge className="gap-1 bg-blue-500/15 text-blue-500 border-blue-500/20" title={`Support aktif sampai ${supportUntil ?? "-"}`}>
        Support Aktif
      </Badge>
    )
  }
  if (status === "expired") {
    return (
      <Badge variant="destructive" className="gap-1" title={`Support berakhir ${supportUntil ?? "-"} - perpanjang di CodeCanyon`}>
        Support Expired
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground" title="Belum ada purchase code/support plan">
      Tidak Ada Support
    </Badge>
  )
}