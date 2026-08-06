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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconBrandTelegram,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconAlertCircle,
  IconSend,
  IconRobot,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import { toast } from "sonner"

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Overview {
  configured: boolean
  botUsername: string | null
  adminChatId: string | null
  webhookSecret: boolean
  webhookUrl: string
  totals: {
    botLogs: number
    botSuccess: number
    botErrors: number
    activeChatStates: number
  }
  actions: Array<{ action: string; total: number }>
}

interface BotLog {
  id: number
  direction: string
  chat_id: number | null
  from_user: number | null
  update_id: number | null
  action: string
  ticket_number: string | null
  target: string | null
  message: string | null
  payload: string | null
  status: string
  error_message: string | null
  telegram_message_id: number | null
  created_at: string
}

interface BotLogsResponse {
  logs: BotLog[]
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

export function Telegram() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [botLogs, setBotLogs] = useState<BotLog[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [botPage, setBotPage] = useState(1)
  const [botAction, setBotAction] = useState("all")
  const [botPagination, setBotPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/manage/api/telegram/overview", { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as Overview
        setOverview(data)
      }
    } catch (err) {
      console.error("Failed to fetch telegram overview:", err)
    }
  }, [])

  const fetchBotLogs = useCallback(async () => {
    try {
      const actionParam = botAction !== "all" ? `&action=${encodeURIComponent(botAction)}` : ""
      const res = await fetch(
        `/manage/api/telegram/bot-logs?page=${botPage}&limit=20&sort=newest${actionParam}`,
        { credentials: "include" },
      )
      if (res.ok) {
        const data = await res.json() as BotLogsResponse
        setBotLogs(data.logs || [])
        setBotPagination(data.pagination)
      }
    } catch (err) {
      console.error("Failed to fetch bot logs:", err)
    }
  }, [botPage, botAction])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchOverview(), fetchBotLogs()]).finally(() => setLoading(false))
  }, [fetchOverview, fetchBotLogs])

  function handleRefresh() {
    fetchOverview()
    fetchBotLogs()
    toast.success("Telegram data refreshed")
  }

  async function handleTest() {
    setBusy("test")
    try {
      const res = await fetch("/manage/api/telegram/test", { method: "POST", credentials: "include" })
      const data = await res.json() as { success?: boolean; error?: string }
      if (data.success) {
        toast.success("Pesan test terkirim ke chat admin")
      } else {
        toast.error(data.error || "Gagal mengirim test")
      }
    } catch {
      toast.error("Gagal menghubungi API")
    } finally {
      setBusy(null)
    }
  }

  function handleBotActionChange(v: string) {
    setBotAction(v)
    setBotPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Telegram Bot</h1>
          <p className="text-muted-foreground">Notifikasi ticket & kontrol support via Telegram</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="cursor-pointer">
          <IconRefresh className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Overview / config */}
      {overview && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <IconBrandTelegram className="h-5 w-5" />
                  Bot Configuration
                </CardTitle>
                <CardDescription>
                  {overview.configured
                    ? `@${overview.botUsername || "chatlokaapibot"} — menerima update dari chat admin`
                    : "Token atau admin chat belum dikonfigurasi"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy !== null}
                  onClick={handleTest}
                >
                  <IconSend className="mr-2 h-4 w-4" />
                  {busy === "test" ? "Sending…" : "Test Bot"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                  {overview.configured ? (
                    <>
                      <IconCheck className="h-4 w-4 text-emerald-500" />
                      <span className="text-emerald-500">Configured</span>
                    </>
                  ) : (
                    <>
                      <IconAlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-amber-500">Not configured</span>
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admin Chat ID</p>
                <p className="mt-1 truncate font-mono text-sm">{overview.adminChatId || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Webhook URL</p>
                <p className="mt-1 truncate font-mono text-xs">{overview.webhookUrl}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Secret Token</p>
                <p className="mt-1 text-sm font-medium">{overview.webhookSecret ? "✓ Set" : "—"}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
              <Card className="border-border/60">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{overview.totals.botLogs}</div>
                  <p className="text-xs text-muted-foreground">Total bot actions</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-emerald-500">{overview.totals.botSuccess}</div>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-500">{overview.totals.botErrors}</div>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{overview.totals.activeChatStates}</div>
                  <p className="text-xs text-muted-foreground">Active chat states</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bot action logs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconRobot className="h-5 w-5" />
                Bot Action Logs
              </CardTitle>
              <CardDescription>
                Page {botPagination.page} of {botPagination.totalPages} ({botPagination.total} total)
              </CardDescription>
            </div>
            <Select value={botAction} onValueChange={(v) => v && handleBotActionChange(v)}>
              <SelectTrigger className="w-[220px] cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="message">message</SelectItem>
                <SelectItem value="callback:ticket_view">callback:ticket_view</SelectItem>
                <SelectItem value="reply_send">reply_send</SelectItem>
                <SelectItem value="notify:ticket_new">notify:ticket_new</SelectItem>
                <SelectItem value="notify:message_inbound">notify:message_inbound</SelectItem>
                <SelectItem value="notify:ticket_reopened">notify:ticket_reopened</SelectItem>
                <SelectItem value="ignored_chat">ignored_chat</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CardTableSkeleton rows={8} columns={6} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time (WIB)</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Chat</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {botLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Belum ada aksi bot tercatat.
                      </TableCell>
                    </TableRow>
                  )}
                  {botLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {toWIB(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={log.direction === "outbound" ? "bg-blue-500/15 text-blue-500 border-blue-500/20 cursor-default" : "bg-emerald-500/15 text-emerald-500 border-emerald-500/20 cursor-default"}
                        >
                          {log.direction}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{log.action}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.chat_id ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.ticket_number || "—"}</TableCell>
                      <TableCell>
                        {log.status === "error" ? (
                          <Badge className="bg-red-500/15 text-red-500 border-red-500/20 cursor-default">{log.status}</Badge>
                        ) : log.status === "ignored" ? (
                          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20 cursor-default">{log.status}</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 cursor-default">{log.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={log.message || log.error_message || ""}>
                        {log.error_message || log.message || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {botPagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={botPage <= 1}
                onClick={() => setBotPage((p) => Math.max(1, p - 1))}
              >
                <IconChevronLeft className="mr-1 h-4 w-4" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                {botPage} / {botPagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                disabled={botPage >= botPagination.totalPages}
                onClick={() => setBotPage((p) => p + 1)}
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
