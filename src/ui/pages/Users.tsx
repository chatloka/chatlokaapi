import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import { useNavigate } from "react-router-dom"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconUsers,
  IconSearch,
  IconMail,
  IconClock,
  IconTicket,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import { ContactTypeBadge, SupportStatusBadge } from "@/components/ContactBadges"

interface ContactRow {
  id: number
  email: string
  name: string | null
  type: "lead" | "customer"
  first_contact_at: string | null
  last_contact_at: string | null
  total_tickets: number
  latest_purchase_code: string | null
  latest_license_type: "regular" | "extended" | null
  latest_support_until: string | null
  support_status: "active" | "expired" | "none"
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

function toWIB(dateStr: string | null) {
  if (!dateStr) return "-"
  const d = parseDbDate(dateStr)
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

export function Users() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<"all" | "lead" | "customer">("all")
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (search.trim()) params.set("search", search.trim())
      if (tab !== "all") params.set("type", tab)
      const res = await fetch(`/manage/api/contacts?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { contacts: ContactRow[]; pagination: Pagination }
        setContacts(data.contacts || [])
        setPagination(data.pagination)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [page, search, tab])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Users</h1>
        <p className="text-muted-foreground">
          Semua orang yang pernah mengirim support ticket. Lead = belum punya purchase code, Customer = sudah membeli.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as "all" | "lead" | "customer"); setPage(1) }}>
          <TabsList>
            <TabsTrigger value="all" className="cursor-pointer">Semua</TabsTrigger>
            <TabsTrigger value="lead" className="cursor-pointer">Leads</TabsTrigger>
            <TabsTrigger value="customer" className="cursor-pointer">Customers</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari email, nama, atau purchase code..."
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value) }}
            className="pl-8"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Daftar Kontak</CardTitle>
              <CardDescription>{pagination.total} kontak tercatat</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CardTableSkeleton rows={8} columns={5} />
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <IconUsers className="h-12 w-12 mb-4" />
              <p>Belum ada kontak yang mengirim ticket.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Support</TableHead>
                    <TableHead>Purchase Code</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Kontak Terakhir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/manage/users/${contact.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {initials(contact.name, contact.email)}
                          </div>
                          <span className="font-medium">{contact.name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <IconMail className="h-3.5 w-3.5" />
                          {contact.email}
                        </span>
                      </TableCell>
                      <TableCell><ContactTypeBadge type={contact.type} /></TableCell>
                      <TableCell>
                        <SupportStatusBadge status={contact.support_status} supportUntil={contact.latest_support_until} />
                      </TableCell>
                      <TableCell>
                        {contact.latest_purchase_code ? (
                          <span className="font-mono text-xs">{contact.latest_purchase_code}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 font-normal">
                          <IconTicket className="h-3 w-3" />
                          {contact.total_tickets}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <IconClock className="h-3 w-3" />
                          {contact.last_contact_at ? toWIB(contact.last_contact_at) : "-"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border p-3">
              <span className="text-xs text-muted-foreground">
                Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} kontak)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm" className="h-7 w-7 cursor-pointer p-0"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <IconChevronLeft size={14} />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 w-7 cursor-pointer p-0"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <IconChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}