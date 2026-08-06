import { useEffect, useState, useMemo, useCallback, Fragment } from "react"
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
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconReceipt,
  IconAlertTriangle,
  IconRefresh,
  IconDownload,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconChartBar,
  IconCheck,
  IconAlertCircle,
  IconServer,
  IconClock,
  IconTerminal2,
  IconChevronDown,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"

interface ApiLog {
  id: number
  method: string
  endpoint: string
  ip_address: string
  user_agent: string
  purchase_code: string | null
  domain: string | null
  status_code: number
  response_time_ms: number
  envato_time_ms: number | null
  request_size_bytes: number | null
  error_message: string | null
  created_at: string
}

interface TamperLog {
  id: number
  license_id: number
  domain: string
  failures: string
  ip: string
  created_at: string
}

interface McpLog {
  id: number
  method: string
  tool: string | null
  params: string | null
  response: string | null
  is_error: number
  status_code: number
  duration_ms: number
  client_name: string | null
  client_version: string | null
  session_id: string | null
  ip_address: string
  user_agent: string
  created_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface LogsResponse {
  logs: ApiLog[]
  pagination: Pagination
}

interface TamperLogsResponse {
  logs: TamperLog[]
  pagination: Pagination
}

interface McpLogsResponse {
  logs: McpLog[]
  pagination: Pagination
}

interface LogStats {
  total_requests: number
  success_count: number
  client_error_count: number
  server_error_count: number
  avg_response_time: number
  max_response_time: number
}

function toWIB(dateStr: string) {
  const d = parseDbDate(dateStr)
  return d.toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

export function Logs() {
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([])
  const [tamperLogs, setTamperLogs] = useState<TamperLog[]>([])
  const [mcpLogs, setMcpLogs] = useState<McpLog[]>([])
  const [loading, setLoading] = useState(true)
  const [apiPagination, setApiPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [tamperPagination, setTamperPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [mcpPagination, setMcpPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [stats, setStats] = useState<LogStats | null>(null)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("newest")
  const [activeTab, setActiveTab] = useState("api")

  const [tamperSearch, setTamperSearch] = useState("")
  const [tamperSort, setTamperSort] = useState("newest")

  const [mcpSearch, setMcpSearch] = useState("")
  const [mcpSort, setMcpSort] = useState("newest")
  const [expandedMcpId, setExpandedMcpId] = useState<number | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : ""
      const tamperSearchParam = tamperSearch ? `&search=${encodeURIComponent(tamperSearch)}` : ""
      const mcpSearchParam = mcpSearch ? `&search=${encodeURIComponent(mcpSearch)}` : ""

      const [apiRes, tamperRes, mcpRes] = await Promise.all([
        fetch(`/manage/api/logs?page=${apiPagination.page}&limit=${apiPagination.limit}&sort=${sort}${searchParam}`, { credentials: "include" }),
        fetch(`/manage/api/logs/tamper?page=${tamperPagination.page}&limit=${tamperPagination.limit}&sort=${tamperSort}${tamperSearchParam}`, { credentials: "include" }),
        fetch(`/manage/api/mcp-logs?page=${mcpPagination.page}&limit=${mcpPagination.limit}&sort=${mcpSort}${mcpSearchParam}`, { credentials: "include" }),
      ])

      if (apiRes.ok) {
        const apiData: LogsResponse = await apiRes.json()
        setApiLogs(apiData.logs || [])
        setApiPagination(apiData.pagination)
      }

      if (tamperRes.ok) {
        const tamperData: TamperLogsResponse = await tamperRes.json()
        setTamperLogs(tamperData.logs || [])
        setTamperPagination(tamperData.pagination)
      }

      if (mcpRes.ok) {
        const mcpData: McpLogsResponse = await mcpRes.json()
        setMcpLogs(mcpData.logs || [])
        setMcpPagination(mcpData.pagination)
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setLoading(false)
    }
  }, [apiPagination.page, apiPagination.limit, tamperPagination.page, tamperPagination.limit, mcpPagination.page, mcpPagination.limit, sort, tamperSort, mcpSort, search, tamperSearch, mcpSearch])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/manage/api/logs/stats", { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { stats: LogStats }
        setStats(data.stats)
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [fetchLogs, fetchStats])

  function handleRefresh() {
    fetchLogs()
    fetchStats()
  }

  function handleSearch() {
    setApiPagination(prev => ({ ...prev, page: 1 }))
    fetchLogs()
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch()
  }

  function handleTamperSearch() {
    setTamperPagination(prev => ({ ...prev, page: 1 }))
    fetchLogs()
  }

  function handleTamperSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleTamperSearch()
  }

  function handleMcpSearch() {
    setMcpPagination(prev => ({ ...prev, page: 1 }))
    fetchLogs()
  }

  function handleMcpSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleMcpSearch()
  }

  function getStatusBadge(statusCode: number) {
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">{statusCode}</Badge>
    }
    if (statusCode >= 300 && statusCode < 400) {
      return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20">{statusCode}</Badge>
    }
    if (statusCode >= 400 && statusCode < 500) {
      return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20">{statusCode}</Badge>
    }
    if (statusCode >= 500) {
      return <Badge className="bg-red-500/15 text-red-500 border-red-500/20">{statusCode}</Badge>
    }
    return <Badge>{statusCode}</Badge>
  }

  function getMethodBadge(method: string) {
    const colors: Record<string, string> = {
      GET: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
      POST: "bg-blue-500/15 text-blue-500 border-blue-500/20",
      PUT: "bg-amber-500/15 text-amber-500 border-amber-500/20",
      DELETE: "bg-red-500/15 text-red-500 border-red-500/20",
    }
    return <Badge className={colors[method] || ""}>{method}</Badge>
  }

  function getMcpMethodBadge(method: string) {
    const colors: Record<string, string> = {
      "tools/call": "bg-violet-500/15 text-violet-400 border-violet-500/20",
      initialize: "bg-blue-500/15 text-blue-500 border-blue-500/20",
      notifications: "bg-sky-500/15 text-sky-400 border-sky-500/20",
      "unauthorized": "bg-red-500/15 text-red-500 border-red-500/20",
    }
    return <Badge className={colors[method] || "bg-muted text-muted-foreground border-border"}>{method}</Badge>
  }

  function exportMcpCSV() {
    const headers = ["Time", "Method", "Tool", "Status", "Duration (ms)", "Client", "IP", "Params", "Response"]
    const rows = mcpLogs.map(log => [
      new Date(log.created_at).toISOString(),
      log.method,
      log.tool || "",
      log.status_code.toString(),
      log.duration_ms.toString(),
      log.client_name || "",
      log.ip_address,
      `"${(log.params || "").replace(/"/g, '""')}"`,
      `"${(log.response || "").replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mcp-logs-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    const headers = ["Time", "Method", "Endpoint", "Status", "Response Time (ms)", "Envato Time (ms)", "IP", "Purchase Code", "Domain", "User Agent"]
    const rows = apiLogs.map(log => [
      new Date(log.created_at).toISOString(),
      log.method,
      log.endpoint,
      log.status_code.toString(),
      log.response_time_ms.toString(),
      log.envato_time_ms?.toString() || "",
      log.ip_address,
      log.purchase_code || "",
      log.domain || "",
      `"${(log.user_agent || "").replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `api-logs-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportTamperCSV() {
    const headers = ["Time", "Domain", "IP", "Failed Files"]
    const rows = tamperLogs.map(log => [
      new Date(log.created_at).toISOString(),
      log.domain,
      log.ip,
      (() => { try { return JSON.parse(log.failures).join("; ") } catch { return "" } })(),
    ])
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tamper-logs-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>API Logs Report</title>
  <style>
    body { font-family: monospace; font-size: 10px; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 5px; }
    p { margin: 2px 0; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    tr:nth-child(even) { background: #fafafa; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>API Logs Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <p>Total records: ${apiLogs.length} (Page ${apiPagination.page} of ${apiPagination.totalPages})</p>
  <table>
    <thead>
      <tr>
        <th>Time</th>
        <th>Method</th>
        <th>Endpoint</th>
        <th>Status</th>
        <th>Response (ms)</th>
        <th>IP</th>
        <th>Purchase Code</th>
      </tr>
    </thead>
    <tbody>
      ${apiLogs.map(log => `
        <tr>
          <td>${new Date(log.created_at).toLocaleString()}</td>
          <td>${log.method}</td>
          <td>${log.endpoint}</td>
          <td class="${log.status_code >= 200 && log.status_code < 300 ? 'success' : 'error'}">${log.status_code}</td>
          <td>${log.response_time_ms}</td>
          <td>${log.ip_address}</td>
          <td>${log.purchase_code || '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  }

  const filteredApiLogs = useMemo(() => {
    return apiLogs.filter(log => {
      if (search) {
        const s = search.toLowerCase()
        return (
          log.endpoint.toLowerCase().includes(s) ||
          log.ip_address.toLowerCase().includes(s) ||
          log.purchase_code?.toLowerCase().includes(s) ||
          log.user_agent?.toLowerCase().includes(s)
        )
      }
      return true
    })
  }, [apiLogs, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Logs</h1>
          <p className="text-muted-foreground">Monitor API traffic and security events</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.total_requests}</div>
                  <p className="text-xs text-muted-foreground">Total Requests (24h)</p>
                </div>
                <IconChartBar className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-emerald-500">{stats.success_count}</div>
                  <p className="text-xs text-muted-foreground">Success (2xx)</p>
                </div>
                <IconCheck className="h-8 w-8 text-emerald-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-amber-500">{stats.client_error_count}</div>
                  <p className="text-xs text-muted-foreground">Client Error (4xx)</p>
                </div>
                <IconAlertCircle className="h-8 w-8 text-amber-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-red-500">{stats.server_error_count}</div>
                  <p className="text-xs text-muted-foreground">Server Error (5xx)</p>
                </div>
                <IconServer className="h-8 w-8 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{Math.round(stats.avg_response_time || 0)}ms</div>
                  <p className="text-xs text-muted-foreground">Avg Response Time</p>
                </div>
                <IconClock className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="api" className="gap-2 cursor-pointer">
              <IconReceipt className="h-4 w-4" />
              API Logs ({apiPagination.total})
            </TabsTrigger>
            <TabsTrigger value="tamper" className="gap-2 cursor-pointer">
              <IconAlertTriangle className="h-4 w-4" />
              Tamper Attempts ({tamperPagination.total})
            </TabsTrigger>
            <TabsTrigger value="mcp" className="gap-2 cursor-pointer">
              <IconTerminal2 className="h-4 w-4" />
              MCP Logs ({mcpPagination.total})
            </TabsTrigger>
          </TabsList>
          <Button onClick={handleRefresh} variant="outline" size="sm" className="cursor-pointer">
            <IconRefresh className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>API Traffic Logs</CardTitle>
                  <CardDescription>
                    Page {apiPagination.page} of {apiPagination.totalPages} ({apiPagination.total} total)
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search logs..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="pl-8 w-full sm:w-64 cursor-text"
                    />
                  </div>
                  <Select value={sort} onValueChange={(v) => v && setSort(v)}>
                    <SelectTrigger className="w-[160px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(apiPagination.limit)} onValueChange={(v) => setApiPagination(prev => ({ ...prev, limit: Number(v), page: 1 }))}>
                    <SelectTrigger className="w-[100px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                      <SelectItem value="100">100 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={exportCSV} variant="outline" size="sm" className="cursor-pointer">
                    <IconDownload className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  <Button onClick={exportPDF} variant="outline" size="sm" className="cursor-pointer">
                    <IconDownload className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardTableSkeleton rows={8} columns={9} />
              ) : filteredApiLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconReceipt className="h-12 w-12 mb-4" />
                  <p>No API logs found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Response</TableHead>
                          <TableHead>Envato</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Purchase Code</TableHead>
                          <TableHead>Domain</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApiLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs whitespace-nowrap">{toWIB(log.created_at)}</TableCell>
                            <TableCell>{getMethodBadge(log.method)}</TableCell>
                            <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                            <TableCell>{getStatusBadge(log.status_code)}</TableCell>
                            <TableCell className="text-xs">{log.response_time_ms}ms</TableCell>
                            <TableCell className="text-xs">{log.envato_time_ms ? `${log.envato_time_ms}ms` : "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{log.ip_address}</TableCell>
                            <TableCell className="font-mono text-xs">{log.purchase_code || "-"}</TableCell>
                            <TableCell className="text-xs">{log.domain || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(apiPagination.page - 1) * apiPagination.limit + 1} to {Math.min(apiPagination.page * apiPagination.limit, apiPagination.total)} of {apiPagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={apiPagination.page <= 1} onClick={() => setApiPagination(prev => ({ ...prev, page: prev.page - 1 }))} className="cursor-pointer">
                        <IconChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">{apiPagination.page} / {apiPagination.totalPages}</span>
                      <Button variant="outline" size="sm" disabled={apiPagination.page >= apiPagination.totalPages} onClick={() => setApiPagination(prev => ({ ...prev, page: prev.page + 1 }))} className="cursor-pointer">
                        <IconChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tamper">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <IconAlertTriangle className="h-5 w-5" />
                    Tamper Attempts
                  </CardTitle>
                  <CardDescription>Detected file integrity violations</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search domain or IP..."
                      value={tamperSearch}
                      onChange={(e) => setTamperSearch(e.target.value)}
                      onKeyDown={handleTamperSearchKeyDown}
                      className="pl-8 w-full sm:w-64 cursor-text"
                    />
                  </div>
                  <Select value={tamperSort} onValueChange={(v) => v && setTamperSort(v)}>
                    <SelectTrigger className="w-[160px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(tamperPagination.limit)} onValueChange={(v) => setTamperPagination(prev => ({ ...prev, limit: Number(v), page: 1 }))}>
                    <SelectTrigger className="w-[100px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                      <SelectItem value="100">100 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={exportTamperCSV} variant="outline" size="sm" className="cursor-pointer">
                    <IconDownload className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardTableSkeleton rows={5} columns={4} />
              ) : tamperLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconAlertTriangle className="h-12 w-12 mb-4" />
                  <p>No tamper attempts recorded</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <div className="flex items-center gap-1"><IconClock className="h-3 w-3" /> Time</div>
                          </TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Failed Files</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tamperLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs whitespace-nowrap">{toWIB(log.created_at)}</TableCell>
                            <TableCell className="font-mono text-xs">{log.domain}</TableCell>
                            <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(() => {
                                  try {
                                    const files = JSON.parse(log.failures)
                                    return files.map((file: string, i: number) => (
                                      <Badge key={i} variant="destructive" className="text-[10px]">{file.split("/").pop()}</Badge>
                                    ))
                                  } catch {
                                    return <Badge variant="destructive">Error parsing</Badge>
                                  }
                                })()}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(tamperPagination.page - 1) * tamperPagination.limit + 1} to {Math.min(tamperPagination.page * tamperPagination.limit, tamperPagination.total)} of {tamperPagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={tamperPagination.page <= 1} onClick={() => setTamperPagination(prev => ({ ...prev, page: prev.page - 1 }))} className="cursor-pointer">
                        <IconChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">{tamperPagination.page} / {tamperPagination.totalPages}</span>
                      <Button variant="outline" size="sm" disabled={tamperPagination.page >= tamperPagination.totalPages} onClick={() => setTamperPagination(prev => ({ ...prev, page: prev.page + 1 }))} className="cursor-pointer">
                        <IconChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <IconTerminal2 className="h-5 w-5" />
                    MCP Request Logs
                  </CardTitle>
                  <CardDescription>Every request to /mcp with request params and response body</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tool, client, IP..."
                      value={mcpSearch}
                      onChange={(e) => setMcpSearch(e.target.value)}
                      onKeyDown={handleMcpSearchKeyDown}
                      className="pl-8 w-full sm:w-64 cursor-text"
                    />
                  </div>
                  <Select value={mcpSort} onValueChange={(v) => v && setMcpSort(v)}>
                    <SelectTrigger className="w-[160px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={String(mcpPagination.limit)} onValueChange={(v) => setMcpPagination(prev => ({ ...prev, limit: Number(v), page: 1 }))}>
                    <SelectTrigger className="w-[100px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                      <SelectItem value="100">100 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={exportMcpCSV} variant="outline" size="sm" className="cursor-pointer">
                    <IconDownload className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CardTableSkeleton rows={8} columns={7} />
              ) : mcpLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconTerminal2 className="h-12 w-12 mb-4" />
                  <p>No MCP requests recorded</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead />
                          <TableHead>Time</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Tool</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mcpLogs.map((log) => (
                          <Fragment key={log.id}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => setExpandedMcpId(expandedMcpId === log.id ? null : log.id)}
                            >
                              <TableCell className="w-6">
                                {expandedMcpId === log.id
                                  ? <IconChevronDown className="h-4 w-4 text-muted-foreground" />
                                  : <IconChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{toWIB(log.created_at)}</TableCell>
                              <TableCell>{getMcpMethodBadge(log.method)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {log.tool ? (
                                  <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/20">{log.tool}</Badge>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                              <TableCell>{getStatusBadge(log.status_code)}</TableCell>
                              <TableCell className="text-xs">{log.duration_ms}ms</TableCell>
                              <TableCell className="text-xs">{log.client_name || "-"}</TableCell>
                              <TableCell className="font-mono text-xs">{log.ip_address}</TableCell>
                            </TableRow>
                            {expandedMcpId === log.id && (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-muted/30">
                                  <div className="grid gap-4 lg:grid-cols-2">
                                    <div>
                                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Request Params</p>
                                      <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                                        {log.params || "(none)"}
                                      </pre>
                                    </div>
                                    <div>
                                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Response</p>
                                      <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                                        {log.response || "(empty)"}
                                      </pre>
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                                    <span>Client: <span className="font-mono">{log.client_name || "-"}{log.client_version ? ` v${log.client_version}` : ""}</span></span>
                                    <span>Session: <span className="font-mono">{log.session_id || "-"}</span></span>
                                    <span>User-Agent: <span className="font-mono">{log.user_agent || "-"}</span></span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {(mcpPagination.page - 1) * mcpPagination.limit + 1} to {Math.min(mcpPagination.page * mcpPagination.limit, mcpPagination.total)} of {mcpPagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={mcpPagination.page <= 1} onClick={() => setMcpPagination(prev => ({ ...prev, page: prev.page - 1 }))} className="cursor-pointer">
                        <IconChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">{mcpPagination.page} / {mcpPagination.totalPages}</span>
                      <Button variant="outline" size="sm" disabled={mcpPagination.page >= mcpPagination.totalPages} onClick={() => setMcpPagination(prev => ({ ...prev, page: prev.page + 1 }))} className="cursor-pointer">
                        <IconChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
