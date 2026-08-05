import { useEffect, useState } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollText, AlertTriangle } from "lucide-react"

interface ApiLog {
  id: number
  endpoint: string
  method: string
  status_code: number
  response_time_ms: number
  envato_response_time_ms: number | null
  ip_address: string
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

interface LogsResponse {
  logs: ApiLog[]
}

interface TamperLogsResponse {
  logs: TamperLog[]
}

export function Logs() {
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([])
  const [tamperLogs, setTamperLogs] = useState<TamperLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    try {
      const [apiRes, tamperRes] = await Promise.all([
        fetch("/manage/api/logs", { credentials: "include" }),
        fetch("/manage/api/logs/tamper", { credentials: "include" }),
      ])

      if (apiRes.ok) {
        const apiData: LogsResponse = await apiRes.json()
        setApiLogs(apiData.logs || [])
      }

      if (tamperRes.ok) {
        const tamperData: TamperLogsResponse = await tamperRes.json()
        setTamperLogs(tamperData.logs || [])
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusBadge(statusCode: number) {
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-green-500">{statusCode}</Badge>
    }
    if (statusCode >= 400 && statusCode < 500) {
      return <Badge variant="secondary">{statusCode}</Badge>
    }
    if (statusCode >= 500) {
      return <Badge variant="destructive">{statusCode}</Badge>
    }
    return <Badge>{statusCode}</Badge>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Logs</h1>
        <p className="text-muted-foreground">
          Monitor API traffic and security events
        </p>
      </div>

      <Tabs defaultValue="api">
        <TabsList>
          <TabsTrigger value="api" className="gap-2 cursor-pointer">
            <ScrollText className="h-4 w-4" />
            API Logs
          </TabsTrigger>
          <TabsTrigger value="tamper" className="gap-2 cursor-pointer">
            <AlertTriangle className="h-4 w-4" />
            Tamper Attempts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API Traffic Logs</CardTitle>
              <CardDescription>
                Recent API requests and response times
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : apiLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ScrollText className="h-12 w-12 mb-4" />
                  <p>No API logs yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Envato Time</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.endpoint}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.method}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(log.status_code)}</TableCell>
                        <TableCell>{log.response_time_ms}ms</TableCell>
                        <TableCell>
                          {log.envato_response_time_ms
                            ? `${log.envato_response_time_ms}ms`
                            : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ip_address}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tamper">
          <Card>
            <CardHeader>
              <CardTitle>Tamper Attempts</CardTitle>
              <CardDescription>
                Detected file integrity violations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : tamperLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mb-4" />
                  <p>No tamper attempts recorded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>License ID</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Failed Files</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tamperLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{log.license_id}</TableCell>
                        <TableCell>{log.domain}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {JSON.parse(log.failures).map(
                              (file: string, i: number) => (
                                <Badge key={i} variant="destructive">
                                  {file}
                                </Badge>
                              )
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ip}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
