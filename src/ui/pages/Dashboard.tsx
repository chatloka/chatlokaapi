import { useEffect, useState } from "react"
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
  IconKey,
  IconPackage,
  IconAlertTriangle,
  IconActivity,
  IconShieldCheck,
  IconClock,
  IconChartBar,
  IconServer,
  IconUser,
  IconWorld,
  IconFileBroken,
  IconEye,
} from "@tabler/icons-react"
import { useNavigate } from "react-router-dom"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface Stats {
  totalLicenses: number
  activeLicenses: number
  deactivatedLicenses: number
  suspendedLicenses: number
  totalPlugins: number
  totalPluginVersions: number
  recentTamperAttempts: number
  apiStats: {
    total24h: number
    success: number
    clientError: number
    serverError: number
    avgResponse: number
  }
  recentLicenses: Array<{
    id: number
    purchase_code: string
    domain: string
    status: string
    buyer_email: string | null
    last_validated_at: string | null
    created_at: string
  }>
  latestTamper: Array<{
    id: number
    domain: string
    failures: string
    ip: string
    created_at: string
  }>
}

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444"]

export function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch("/manage/api/stats", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const apiPieData = stats ? [
    { name: "Success", value: stats.apiStats.success },
    { name: "Client Error", value: stats.apiStats.clientError },
    { name: "Server Error", value: stats.apiStats.serverError },
  ].filter(d => d.value > 0) : []

  const licensePieData = stats ? [
    { name: "Active", value: stats.activeLicenses },
    { name: "Deactivated", value: stats.deactivatedLicenses },
    { name: "Suspended", value: stats.suspendedLicenses },
  ].filter(d => d.value > 0) : []

  const chartData = stats ? [
    { name: "Success", count: stats.apiStats.success },
    { name: "Client Err", count: stats.apiStats.clientError },
    { name: "Server Err", count: stats.apiStats.serverError },
  ] : []

  function toWIB(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your Chatloka license system</p>
        </div>
        <Button variant="outline" onClick={fetchStats} className="cursor-pointer">
          <IconClock className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Licenses</CardTitle>
            <IconKey className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLicenses ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.activeLicenses ?? 0} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plugins</CardTitle>
            <IconPackage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPlugins ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.totalPluginVersions ?? 0} versions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Requests (24h)</CardTitle>
            <IconChartBar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.apiStats.total24h ?? 0}</div>
            <p className="text-xs text-muted-foreground">{Math.round(stats?.apiStats.avgResponse ?? 0)}ms avg</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamper Attempts</CardTitle>
            <IconAlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats?.recentTamperAttempts ?? 0}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconServer className="h-4 w-4" />
              API Response (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 10%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "oklch(0.708 0 0)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "oklch(0.708 0 0)" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.205 0 0)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "oklch(0.985 0 0)" }}
                    itemStyle={{ color: "oklch(0.985 0 0)" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.511 0.262 276.966)" fill="oklch(0.511 0.262 276.966 / 0.2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconActivity className="h-4 w-4" />
              License Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={licensePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {licensePieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.205 0 0)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "oklch(0.985 0 0)" }}
                    itemStyle={{ color: "oklch(0.985 0 0)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-2">
              {licensePieData.map((item, i) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-muted-foreground">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Recent Licenses + Latest Tamper */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconShieldCheck className="h-4 w-4" />
              Recent Licenses
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/manage/licenses")} className="cursor-pointer text-xs">
              <IconEye className="mr-1 h-3 w-3" /> View all
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentLicenses && stats.recentLicenses.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Validated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentLicenses.map((lic) => (
                    <TableRow key={lic.id}>
                      <TableCell className="font-mono text-xs">{lic.domain}</TableCell>
                      <TableCell>
                        {lic.status === "active" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Active</Badge>
                        ) : lic.status === "suspended" ? (
                          <Badge variant="destructive">Suspended</Badge>
                        ) : (
                          <Badge variant="secondary">Deactivated</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lic.last_validated_at ? toWIB(lic.last_validated_at) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No licenses yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconFileBroken className="h-4 w-4" />
              Latest Tamper Alerts
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/manage/logs")} className="cursor-pointer text-xs">
              <IconEye className="mr-1 h-3 w-3" /> View all
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.latestTamper && stats.latestTamper.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Files</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.latestTamper.map((t) => {
                    const fileCount = (() => { try { return JSON.parse(t.failures).length } catch { return 0 } })()
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{toWIB(t.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{t.domain}</TableCell>
                        <TableCell className="font-mono text-xs">{t.ip}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{fileCount} files</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No tamper attempts</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
