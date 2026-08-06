import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import { useParams, useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconArrowLeft,
  IconUsers,
  IconMail,
  IconTicket,
  IconKey,
  IconPlus,
  IconTrash,
  IconLoader,
  IconShieldCheck,
  IconFileDownload,
  IconPrinter,
  IconCircleCheck,
  IconCloudCheck,
  IconPencil,
  IconCheck,
  IconX,
} from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ContactTypeBadge, SupportStatusBadge } from "@/components/ContactBadges"
import { toast } from "sonner"

interface Purchase {
  id: number
  contact_id: number
  purchase_code: string
  license_type: "regular" | "extended"
  item_name: string | null
  purchase_date: string | null
  support_until: string | null
  support_term_months: number | null
  source: "envato" | "manual"
  created_at: string
  updated_at: string
}

interface ContactTicket {
  id: number
  ticket_number: string
  subject: string
  status: string
  priority: string
  last_message_at: string | null
  message_count: number
  created_at: string
}

interface ContactDetail {
  id: number
  email: string
  name: string | null
  type: "lead" | "customer"
  first_contact_at: string | null
  last_contact_at: string | null
  total_tickets: number
  notes: string | null
  latest_purchase_code: string | null
  latest_license_type: "regular" | "extended" | null
  latest_support_until: string | null
  support_status: "active" | "expired" | "none"
  purchases: Purchase[]
  tickets: ContactTicket[]
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-"
  const d = parseDbDate(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email
  const parts = source.split(/[\s,@.]+/).filter(Boolean)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

function supportStatusOf(supportUntil: string | null): "active" | "expired" | "none" {
  if (!supportUntil) return "none"
  const end = new Date(supportUntil)
  if (Number.isNaN(end.getTime())) return "none"
  return end.getTime() > Date.now() ? "active" : "expired"
}

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : "")

export function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // Add purchase dialog
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [pcCode, setPcCode] = useState("")
  const [pcLicenseType, setPcLicenseType] = useState<"regular" | "extended">("regular")
  const [pcItemName, setPcItemName] = useState("")
  const [pcPurchaseDate, setPcPurchaseDate] = useState("")
  const [pcSupportUntil, setPcSupportUntil] = useState("")
  const [pcSource, setPcSource] = useState<"envato" | "manual">("manual")

  // Edit purchase dialog
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [editLicense, setEditLicense] = useState<"regular" | "extended">("regular")
  const [editSupportUntil, setEditSupportUntil] = useState("")
  const [editTerm, setEditTerm] = useState("6")
  const [editSaving, setEditSaving] = useState(false)

  // Name/notes editing
  const [nameDraft, setNameDraft] = useState("")
  const [notesDraft, setNotesDraft] = useState("")
  const [nameEditing, setNameEditing] = useState(false)

  const fetchContact = useCallback(async () => {
    try {
      const res = await fetch(`/manage/api/contacts/${id}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { contact: ContactDetail }
        setContact(data.contact)
        setNameDraft(data.contact.name || "")
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (id) fetchContact()
  }, [id, fetchContact])

  async function handleVerify() {
    if (!pcCode.trim()) return
    setVerifying(true)
    try {
      const res = await fetch("/manage/api/contacts/verify-purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_code: pcCode.trim() }),
      })
      const data = await res.json() as { purchase?: Purchase; error?: string }
      if (!res.ok) {
        toast.error(data.error || "Verifikasi gagal")
        return
      }
      if (data.purchase) {
        setPcLicenseType(data.purchase.license_type)
        setPcItemName(data.purchase.item_name || "")
        setPcPurchaseDate(toDateInput(data.purchase.purchase_date || null))
        setPcSupportUntil(toDateInput(data.purchase.support_until || null))
        setPcSource("envato")
        toast.success("Purchase code valid! Data terisi otomatis dari Envato.")
      }
    } catch {
      toast.error("Terjadi kesalahan saat verifikasi")
    } finally {
      setVerifying(false)
    }
  }

  function handleAddPurchase() {
    if (!pcCode.trim()) {
      toast.error("Purchase code wajib diisi")
      return
    }
    setSaving(true)
    fetch(`/manage/api/contacts/${id}/purchases`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchase_code: pcCode.trim(),
        license_type: pcLicenseType,
        item_name: pcItemName || null,
        purchase_date: pcPurchaseDate ? new Date(`${pcPurchaseDate}T00:00:00`).toISOString() : null,
        support_until: pcSupportUntil ? new Date(`${pcSupportUntil}T00:00:00`).toISOString() : null,
        support_term_months: 6,
        source: pcSource,
      }),
    })
      .then(async (res) => {
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error || "Gagal menambahkan purchase")
        toast.success("Purchase code ditambahkan. Kontak di-promote menjadi Customer.")
        setAddOpen(false)
        setPcCode("")
        setPcItemName("")
        setPcPurchaseDate("")
        setPcSupportUntil("")
        setPcSource("manual")
        await fetchContact()
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Gagal menambahkan purchase"))
      .finally(() => setSaving(false))
  }

  function openEdit(purchase: Purchase) {
    setEditing(purchase)
    setEditLicense(purchase.license_type)
    setEditSupportUntil(toDateInput(purchase.support_until))
    setEditTerm(String(purchase.support_term_months || 6))
  }

  async function saveEdit() {
    if (!editing) return
    setEditSaving(true)
    const supportUntil = editSupportUntil
      ? new Date(`${editSupportUntil}T00:00:00`).toISOString()
      : null
    fetch(`/manage/api/contacts/${id}/purchases/${editing.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_type: editLicense,
        support_until: supportUntil,
        support_term_months: Number(editTerm),
      }),
    })
      .then(async (res) => {
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error || "Gagal update")
        toast.success("Purchase diperbarui")
        setEditing(null)
        await fetchContact()
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Gagal update"))
      .finally(() => setEditSaving(false))
  }

  async function deletePurchase(purchase: Purchase) {
    if (!window.confirm(`Hapus purchase code ${purchase.purchase_code}?`)) return
    try {
      const res = await fetch(`/manage/api/contacts/${id}/purchases/${purchase.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success("Purchase dihapus")
        await fetchContact()
      }
    } catch {
      toast.error("Gagal menghapus purchase")
    }
  }

  async function saveName() {
    try {
      const res = await fetch(`/manage/api/contacts/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft, notes: notesDraft }),
      })
      if (res.ok) {
        toast.success("Data disimpan")
        setNameEditing(false)
        await fetchContact()
      }
    } catch {
      toast.error("Gagal menyimpan")
    }
  }

  // CSV export (client side)
  function exportCsv() {
    if (!contact) return
    const header = [
      "Name", "Email", "Type", "Purchase Code", "License Type", "Item",
      "Purchase Date", "Support Until", "Support Status",
    ]
    const rows = contact.purchases.map((p) => [
      contact.name || "", contact.email, contact.type, p.purchase_code, p.license_type,
      p.item_name || "", p.purchase_date || "", p.support_until || "",
      supportStatusOf(p.support_until),
    ])
    const csv = [header, ...rows].map((r) =>
      r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `user-${contact.email}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("CSV diekspor")
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2"><Skeleton className="h-6 w-52" /><Skeleton className="h-4 w-40" /></div>
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-12" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-12" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-24" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-24" /></div>
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/manage/users")} className="cursor-pointer">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Users
        </Button>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <IconUsers className="h-12 w-12 mb-4" />
          <p>User tidak ditemukan</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/manage/users")} className="cursor-pointer">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {initials(contact.name, contact.email)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{contact.name || "Tanpa nama"}</h1>
              <ContactTypeBadge type={contact.type} />
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <IconMail className="h-3.5 w-3.5" />
              {contact.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} className="cursor-pointer">
            <IconFileDownload className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              document.body.classList.add("printing-user-detail")
              window.print()
              window.onafterprint = () => document.body.classList.remove("printing-user-detail")
            }}
            className="cursor-pointer"
          >
            <IconPrinter className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipe</CardTitle>
            <IconUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{contact.type === "customer" ? "Customer" : "Lead"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Support</CardTitle>
            <IconShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <SupportStatusBadge status={contact.support_status} supportUntil={contact.latest_support_until} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase</CardTitle>
            <IconKey className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{contact.purchases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Support Tickets</CardTitle>
            <IconTicket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{contact.total_tickets}</div>
          </CardContent>
        </Card>
      </div>

      {/* Contact info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Informasi Kontak</CardTitle>
              <CardDescription>Data utama kontak</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setNameEditing(!nameEditing)} className="cursor-pointer">
              <IconPencil className="mr-1 h-3.5 w-3.5" />
              {nameEditing ? "Batal" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {nameEditing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama</Label>
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Catatan</Label>
                <Textarea rows={3} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Catatan internal..." />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setNameEditing(false); setNameDraft(contact.name || "") }} className="cursor-pointer">
                  <IconX className="mr-1 h-3.5 w-3.5" /> Batal
                </Button>
                <Button size="sm" onClick={saveName} className="cursor-pointer">
                  <IconCheck className="mr-1 h-3.5 w-3.5" /> Simpan
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{contact.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kontak pertama</p>
                <p>{formatDate(contact.first_contact_at)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kontak terakhir</p>
                <p>{formatDate(contact.last_contact_at)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Catatan</p>
                <p className="text-sm whitespace-pre-wrap">{contact.notes || "-"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Purchase Code</CardTitle>
            <CardDescription>
              Daftar pembelian terkait kontak ini. Support mengikuti kebijakan CodeCanyon (6 bulan standar, dapat diperpanjang).
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} className="cursor-pointer">
            <IconPlus className="mr-2 h-4 w-4" />
            Tambah Purchase Code
          </Button>
        </CardHeader>
        <CardContent>
          {contact.purchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <IconKey className="h-10 w-10 mb-3" />
              <p className="text-sm">Belum ada purchase code. Tambahkan untuk mengubah kontak menjadi Customer.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase Code</TableHead>
                    <TableHead>Lisensi</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Tgl Beli</TableHead>
                    <TableHead>Support Sampai</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sumber</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contact.purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.purchase_code}</TableCell>
                      <TableCell>
                        <Badge className={p.license_type === "regular"
                          ? "bg-blue-500/15 text-blue-500 border-blue-500/20"
                          : "bg-purple-500/15 text-purple-500 border-purple-500/20"}>
                          {p.license_type === "regular" ? "Regular" : "Extended"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{p.item_name || "-"}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.purchase_date)}</TableCell>
                      <TableCell className="text-sm">{formatDate(p.support_until)}</TableCell>
                      <TableCell><SupportStatusBadge status={supportStatusOf(p.support_until)} supportUntil={p.support_until} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 font-normal">
                          {p.source === "envato" ? (
                            <><IconCloudCheck className="h-3 w-3 text-emerald-500" /> Envato</>
                          ) : (
                            <><IconPencil className="h-3 w-3" /> Manual</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 cursor-pointer p-0" onClick={() => openEdit(p)} title="Edit">
                            <IconPencil size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 cursor-pointer p-0 text-destructive" onClick={() => deletePurchase(p)} title="Hapus">
                            <IconTrash size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tickets */}
      <Card>
        <CardHeader>
          <CardTitle>Support Tickets</CardTitle>
          <CardDescription>Semua ticket yang dikirim oleh kontak ini</CardDescription>
        </CardHeader>
        <CardContent>
          {contact.tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Belum ada ticket.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pesan</TableHead>
                    <TableHead>Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contact.tickets.map((t) => (
                    <TableRow
                      key={t.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/manage/tickets/${t.ticket_number}`)}
                    >
                      <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                      <TableCell className="max-w-[300px]"><span className="block truncate text-sm">{t.subject}</span></TableCell>
                      <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                      <TableCell>{t.message_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add purchase dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <IconKey size={16} />
              Tambah Purchase Code
            </DialogTitle>
            <DialogDescription>
              Masukkan purchase code dari CodeCanyon. Gunakan {"\u201C"}Verifikasi{"\u201D"} untuk mengisi data otomatis dari Envato, atau isi manual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Purchase Code *</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 font-mono text-xs"
                  placeholder="mis. 12345678-aaaa-bbbb-cccc-dddd1234abcd"
                  value={pcCode}
                  onChange={(e) => setPcCode(e.target.value)}
                />
                <Button
                  variant="outline" size="sm" className="cursor-pointer shrink-0" onClick={handleVerify} disabled={verifying || !pcCode.trim()}
                >
                  {verifying ? <IconLoader size={14} className="mr-1 animate-spin" /> : <IconCloudCheck size={14} className="mr-1" />}
                  {verifying ? "..." : "Verify"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipe Lisensi</Label>
              <Select value={pcLicenseType} onValueChange={(v) => (v === "regular" || v === "extended") && setPcLicenseType(v)}>
                <SelectTrigger className="h-8 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="extended">Extended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nama Item</Label>
              <Input className="h-8 text-xs" placeholder="Nama produk (opsional)" value={pcItemName} onChange={(e) => setPcItemName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal Pembelian</Label>
                <Input className="h-8 text-xs" type="date" value={pcPurchaseDate} onChange={(e) => setPcPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Support Sampai</Label>
                <Input className="h-8 text-xs" type="date" value={pcSupportUntil} onChange={(e) => setPcSupportUntil(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <IconShieldCheck className="mr-1 inline h-3.5 w-3.5" />
              Support didapat dari Envato jika diverifikasi. Bila manual, isi manual sesuai masa support (biasanya 6-12 bulan dari pembelian).
            </p>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setAddOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button size="sm" className="cursor-pointer" onClick={handleAddPurchase} disabled={saving}>
              {saving ? <IconLoader size={14} className="mr-1 animate-spin" /> : <IconCircleCheck size={14} className="mr-1" />}
              {saving ? "Menyimpan..." : "Simpan Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit purchase dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Purchase</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Purchase Code</Label>
                <p className="font-mono text-sm">{editing.purchase_code}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipe Lisensi</Label>
                <Select value={editLicense} onValueChange={(v) => (v === "regular" || v === "extended") && setEditLicense(v)}>
                  <SelectTrigger className="h-8 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="extended">Extended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Masa Support (bulan)</Label>
                <Select value={editTerm} onValueChange={(v) => v && setEditTerm(v)}>
                  <SelectTrigger className="h-8 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 bulan</SelectItem>
                    <SelectItem value="12">12 bulan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Support Sampai</Label>
                <Input type="date" className="h-8 text-xs" value={editSupportUntil} onChange={(e) => setEditSupportUntil(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setEditing(null)} disabled={editSaving}>Batal</Button>
                <Button size="sm" className="cursor-pointer" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? <IconLoader size={14} className="mr-1 animate-spin" /> : <IconCheck size={14} className="mr-1" />}
                  Simpan
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TicketStatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Open</Badge>
  if (status === "pending") return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20">Pending</Badge>
  if (status === "closed") return <Badge variant="secondary">Closed</Badge>
  if (status === "merged") return <Badge variant="outline">Merged</Badge>
  return <Badge variant="secondary">{status}</Badge>
}