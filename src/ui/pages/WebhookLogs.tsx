import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconBrandTelegram,
  IconMail,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import { toast } from "sonner"

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface WebhookLog {
  id: number
  provider: string
  event_type: string | null
  telegram_update_id: number | null
  chat_id: number | null
  source_ip: string | null
  raw_payload: string
  handled: number
  error_message: string | null
  created_at: string
}

interface WebhookLogsResponse {
  logs: WebhookLog[]
  pagination: Pagination
}

function toWIB(dateStr: string) {
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

export function WebhookLogs() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState("telegram")
  const [handled, setHandled] = useState("all")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })

  const fetchLogs = useCallback(async () => {
    try {
      const providerParam = provider !== "all" ? `&provider=${encodeURIComponent(provider)}` : ""
      const handledParam = handled !== "all" ? `&handled=${handled}` : ""
      const res = await fetch(
        `/manage/api/logs/webhooks?page=${page}&limit=20&sort=newest${providerParam}${handledParam}`,
        { credentials: "include" },
      )
      if (res.ok) {
        const data = await res.json() as WebhookLogsResponse
        setLogs(data.logs || [])
        setPagination(data.pagination)
      }
    } catch (err) {
      console.error("Failed to fetch webhook logs:", err)
    }
  }, [provider, handled, page])

  useEffect(() => {
    setLoading(true)
    fetchLogs().finally(() => setLoading(false))
  }, [fetchLogs])

  function handleProviderChange(v: string) {
    setProvider(v)
    setPage(1)
  }

  function handleHandledChange(v: string) {
    setHandled(v)
    setPage(1)
  }

  function handleRefresh() {
    fetchLogs()
    toast.success("Webhook logs refreshed")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Webhook Logs</h1>
          <p className="text-muted-foreground">Payload masuk dari Telegram & Resend</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="cursor-pointer">
          <IconRefresh className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Incoming Webhook Payloads</CardTitle>
              <CardDescription>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={handled} onValueChange={(v) => v && handleHandledChange(v)}>
                <SelectTrigger className="w-[150px] cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All states</SelectItem>
                  <SelectItem value="1">Handled</SelectItem>
                  <SelectItem value="0">Failed / ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={provider} onValueChange={(v) => v && handleProviderChange(v)} className="mb-4">
            <TabsList>
              <TabsTrigger value="telegram" className="gap-2 cursor-pointer">
                <IconBrandTelegram className="h-4 w-4" />
                Telegram
              </TabsTrigger>
              <TabsTrigger value="resend" className="gap-2 cursor-pointer">
                <IconMail className="h-4 w-4" />
                Resend
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <CardTableSkeleton rows={8} columns={6} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time (WIB)</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Update ID</TableHead>
                    <TableHead>Chat ID</TableHead>
                    <TableHead>Source IP</TableHead>
                    <TableHead>Handled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Belum ada webhook tercatat.
                      </TableCell>
                    </TableRow>
                  )}
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {toWIB(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="cursor-default">
                          {log.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.event_type || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.telegram_update_id ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.chat_id ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.source_ip || "—"}</TableCell>
                      <TableCell>
                        {log.handled === 1 ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 cursor-default">ok</Badge>
                        ) : (
                          <Badge className="bg-red-500/15 text-red-500 border-red-500/20 cursor-default" title={log.error_message || ""}>
                            failed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <IconChevronLeft className="mr-1 h-4 w-4" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <IconChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
