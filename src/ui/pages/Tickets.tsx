import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import { useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconTicket,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconLoader,
  IconRefresh,
  IconUser,
  IconFilter,
  IconMessageCircle,
  IconArrowUp,
  IconArrowDown,
  IconCircleDot,
  IconForbid,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import { ContactTypeBadge } from "@/components/ContactBadges"
import { getCategoryBadgeClass, getCategoryLabel, TICKET_CATEGORIES } from "@/lib/ticketCategories"

interface Ticket {
  id: number
  ticket_number: string
  purchase_code: string | null
  domain: string | null
  from_email: string
  from_name?: string | null
  subject: string
  status: string
  priority: string
  category?: string | null
  assigned_to: string | null
  last_message_at: string | null
  message_count: number
  created_at: string
  updated_at: string
  contact_type?: "lead" | "customer" | null
  latest_purchase_code?: string | null
  latest_license_type?: "regular" | "extended" | null
  latest_support_until?: string | null
}

interface TicketStats {
  total: number
  open: number
  pending: number
  closed: number
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

function getStatusBadge(status: string) {
  switch (status) {
    case "open":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 cursor-pointer">
          <IconCircleCheck className="mr-1 h-3 w-3" />
          Open
        </Badge>
      )
    case "pending":
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 cursor-pointer">
          <IconLoader className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      )
    case "closed":
      return (
        <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/20 cursor-pointer">
          <IconForbid className="mr-1 h-3 w-3" />
          Closed
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="cursor-pointer">
          {status}
        </Badge>
      )
  }
}

function getCategoryBadge(category: string | null | undefined) {
  return (
    <Badge className={`${getCategoryBadgeClass(category)} cursor-pointer`}>
      {getCategoryLabel(category)}
    </Badge>
  )
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "high":
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/20 cursor-pointer">
          <IconArrowUp className="mr-1 h-3 w-3" />
          High
        </Badge>
      )
    case "medium":
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 cursor-pointer">
          <IconCircleDot className="mr-1 h-3 w-3" />
          Medium
        </Badge>
      )
    case "low":
      return (
        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 cursor-pointer">
          <IconArrowDown className="mr-1 h-3 w-3" />
          Low
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="cursor-pointer">
          {priority}
        </Badge>
      )
  }
}

export function Tickets() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<TicketStats>({ total: 0, open: 0, pending: 0, closed: 0 })
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort,
      })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (categoryFilter !== "all") params.set("category", categoryFilter)
      if (search) params.set("search", search)

      const res = await fetch(`/manage/api/tickets?${params}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { tickets: Ticket[]; pagination: Pagination }
        setTickets(data.tickets)
        setPagination(data.pagination)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, categoryFilter, sort, search])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/manage/api/tickets/stats", { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { stats: TicketStats }
        setStats(data.stats)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    fetchTickets()
  }, [page, statusFilter, categoryFilter, sort, fetchTickets])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchTickets()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <IconTicket className="h-6 w-6 text-primary" />
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage customer support tickets and email conversations
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { fetchTickets(); fetchStats() }}
          className="cursor-pointer"
        >
          <IconRefresh className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2">
                <IconTicket className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-emerald-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-emerald-400">{stats.open}</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <IconCircleCheck className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-amber-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2">
                <IconLoader className="h-5 w-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-zinc-500/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Closed</p>
                <p className="text-2xl font-bold text-zinc-400">{stats.closed}</p>
              </div>
              <div className="rounded-lg bg-zinc-500/10 p-2">
                <IconForbid className="h-5 w-5 text-zinc-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <IconFilter className="h-5 w-5" />
            Filter & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tickets, emails, subjects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" size="sm" className="cursor-pointer">
                Search
              </Button>
            </form>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
              <Select value={statusFilter} onValueChange={(val) => { if (val) { setStatusFilter(val); setPage(1) } }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
              <Select value={categoryFilter} onValueChange={(val) => { if (val) { setCategoryFilter(val); setPage(1) } }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {TICKET_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {getCategoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort:</span>
              <Select value={sort} onValueChange={(val) => { if (val) setSort(val) }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              All Tickets ({pagination.total})
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages || 1}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CardTableSkeleton />
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <IconTicket className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No tickets found</p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="space-y-2 md:hidden">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => navigate(`/manage/tickets/${ticket.ticket_number}`)}
                    className="block w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-primary">
                        {ticket.ticket_number}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {getStatusBadge(ticket.status)}
                        {getCategoryBadge(ticket.category)}
                        {getPriorityBadge(ticket.priority)}
                      </div>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-foreground">
                      {ticket.subject}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <IconUser className="h-3 w-3 shrink-0 text-primary" />
                        <span className="truncate">
                          {ticket.from_name
                            ? `${ticket.from_name} <${ticket.from_email}>`
                            : ticket.from_email}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <IconMessageCircle className="h-3 w-3" />
                        {ticket.message_count}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {toWIB(ticket.created_at)} WIB
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Ticket</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[140px]">Category</TableHead>
                    <TableHead className="w-[100px]">Priority</TableHead>
                    <TableHead className="w-[80px] text-center">
                      <IconMessageCircle className="h-4 w-4 mx-auto" />
                    </TableHead>
                    <TableHead className="w-[160px]">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/manage/tickets/${ticket.ticket_number}`)}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {ticket.ticket_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-primary/10 p-1">
                            <IconUser className="h-3 w-3 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[180px]">
                              {ticket.from_name
                                ? `${ticket.from_name} <${ticket.from_email}>`
                                : ticket.from_email}
                            </span>
                            <ContactTypeBadge type={ticket.contact_type} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate max-w-[250px] block">
                          {ticket.subject}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell>{getCategoryBadge(ticket.category)}</TableCell>
                      <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">
                          {ticket.message_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {toWIB(ticket.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, pagination.total)} of {pagination.total} tickets
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="cursor-pointer"
                >
                  <IconChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  className="cursor-pointer"
                >
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
