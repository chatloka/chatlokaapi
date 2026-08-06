import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import { useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  IconTicket,
  IconClock,
  IconBolt,
  IconChartBar,
  IconRefresh,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface TicketAnalytics {
  summary: {
    totalTickets: number
    totalReplies: number
    ticketsWithFirstResponse: number
    firstResponseRate: number
    avgFirstResponseMinutes: number | null
    avgResponseMinutes: number | null
    slowestResponseMinutes: number | null
  }
  byWeekday: Array<{
    day: string
    tickets: number
    avgFirstResponseMinutes: number | null
    replies: number
    avgResponseMinutes: number | null
  }>
  byHour: Array<{
    hour: number
    label: string
    tickets: number
    avgFirstResponseMinutes: number | null
    replies: number
    avgResponseMinutes: number | null
  }>
  slowGaps: Array<{
    id: number
    ticket_number: string
    subject: string
    from_email: string
    response_minutes: number
    responded_at: string
    weekday: string
    hour_wib: number
  }>
}

function toWIB(dateStr: string): string {
  if (!dateStr) return "-"
  const d = parseDbDate(dateStr)
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return "—"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

const WEEKDAY_SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
}

const TOOLTIP_STYLE = {
  backgroundColor: "oklch(0.205 0 0)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: "8px",
  fontSize: "12px",
}

export function TicketAnalyticsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<TicketAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/manage/api/tickets/analytics", {
        credentials: "include",
      })
      if (res.ok) {
        const data = (await res.json()) as { analytics: TicketAnalytics }
        setData(data.analytics)
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Ticket Analytics
            </h1>
            <p className="text-muted-foreground">Response performance in WIB</p>
          </div>
        </div>
        <CardTableSkeleton rows={8} />
      </div>
    )
  }

  const s = data?.summary

  const weekdayChartData = (data?.byWeekday || []).map((d) => ({
    ...d,
    dayShort: WEEKDAY_SHORT[d.day] || d.day,
  }))

  const hourChartData = (data?.byHour || []).filter((d) => d.tickets > 0 || d.avgResponseMinutes !== null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Ticket Analytics
          </h1>
          <p className="text-muted-foreground">
            Response-time metrics bucketed in WIB (UTC+7)
          </p>
        </div>
        <Button variant="outline" onClick={fetchAnalytics} className="cursor-pointer">
          <IconRefresh className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <IconTicket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.totalTickets ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {s?.totalReplies ?? 0} admin replies sent
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">First Response Rate</CardTitle>
            <IconBolt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.firstResponseRate ?? 0}%</div>
            <p className="text-xs text-muted-foreground">
              {s?.ticketsWithFirstResponse ?? 0} of {s?.totalTickets ?? 0} tickets answered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg First Response</CardTitle>
            <IconClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(s?.avgFirstResponseMinutes ?? null)}</div>
            <p className="text-xs text-muted-foreground">On average</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <IconChartBar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(s?.avgResponseMinutes ?? null)}</div>
            <p className="text-xs text-muted-foreground">
              Slowest: {formatDuration(s?.slowestResponseMinutes ?? null)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekday charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconTicket className="h-4 w-4" />
              Tickets received (per weekday, WIB)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
                  <XAxis dataKey="dayShort" tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "oklch(1 0 0 / 0.05)" }}
                  />
                  <Bar dataKey="tickets" name="Tickets" fill="oklch(0.511 0.262 276.966)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconClock className="h-4 w-4" />
              Avg first response per weekday (min, WIB)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
                  <XAxis dataKey="dayShort" tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "oklch(1 0 0 / 0.05)" }}
                    formatter={(value) => [formatDuration(Number(value)), "min"] as [string, string]}
                  />
                  <Bar dataKey="avgFirstResponseMinutes" name="Avg first response (min)" fill="oklch(0.769 0.188 70.08)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconChartBar className="h-4 w-4" />
              Tickets received per hour (WIB)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.708 0 0)" }} interval={2} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "oklch(1 0 0 / 0.05)" }}
                  />
                  <Bar dataKey="tickets" name="Tickets" fill="oklch(0.511 0.262 276.966)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconClock className="h-4 w-4" />
              Avg response per hour (min, WIB)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.708 0 0)" }} interval={2} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.708 0 0)" }} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "oklch(1 0 0 / 0.05)" }}
                    formatter={(value) => [formatDuration(Number(value)), ""]}
                  />
                  <Bar dataKey="avgResponseMinutes" name="Avg response (min)" fill="oklch(0.769 0.188 70.08)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Slow gaps table */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 text-amber-500" />
            Slowest responses (top 25)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Ticket</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden sm:table-cell">From</TableHead>
                  <TableHead className="text-right">Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.slowGaps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No slow responses recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {data?.slowGaps.map((gap) => (
                  <TableRow key={gap.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell>
                      <button
                        className="font-mono text-xs text-primary cursor-pointer"
                        onClick={() => navigate(`/manage/tickets/${gap.ticket_number}`)}
                      >
                        {gap.ticket_number}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      <span className="text-sm text-foreground">{gap.subject}</span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{toWIB(gap.responded_at)} WIB</span>
                        <Badge variant="outline" className="text-[10px]">{gap.weekday}, {gap.hour_wib}:00</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {gap.from_email}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="font-medium text-amber-500 border-amber-500/30">
                        {formatDuration(gap.response_minutes)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}