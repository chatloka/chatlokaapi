import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { parseDbDate } from "@/lib/dates"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  IconArrowLeft,
  IconBrandTelegram,
  IconMail,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react"
import { toast } from "sonner"

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
  duration_ms: number | null
  created_at: string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = parseDbDate(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function WebhookLogDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [log, setLog] = useState<WebhookLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`/manage/api/logs/webhooks/${id}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as WebhookLog
        setLog(data)
      } else {
        toast.error("Webhook log tidak ditemukan")
      }
    } catch (err) {
      console.error("Failed to fetch webhook log:", err)
      toast.error("Gagal mengambil data webhook log")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    fetchLog()
  }, [fetchLog])

  async function handleCopy() {
    if (!log) return
    try {
      await navigator.clipboard.writeText(log.raw_payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Gagal menyalin payload")
    }
  }

  const durationClass =
    log && log.duration_ms !== null
      ? log.duration_ms < 500
        ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
        : log.duration_ms < 2000
          ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
          : "bg-red-500/15 text-red-500 border-red-500/20"
      : ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            onClick={() => navigate("/manage/webhook-logs")}
            aria-label="Back"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Webhook Log #{id}</h1>
            <p className="text-muted-foreground">Detail raw payload masuk</p>
          </div>
        </div>
        {log && (
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={handleCopy}>
            {copied ? <IconCheck className="mr-2 h-4 w-4 text-emerald-500" /> : <IconCopy className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Copy Payload"}
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : !log ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Webhook log tidak ditemukan.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {log.provider === "telegram" ? (
                  <IconBrandTelegram className="h-5 w-5" />
                ) : (
                  <IconMail className="h-5 w-5" />
                )}
                {log.provider === "telegram" ? "Telegram Webhook" : "Resend Webhook"}
              </CardTitle>
              <CardDescription>Metadata penerimaan webhook</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Received at (WIB)</dt>
                  <dd className="mt-1 font-mono">{formatDateTime(log.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Event Type</dt>
                  <dd className="mt-1 font-mono">{log.event_type || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source IP</dt>
                  <dd className="mt-1 font-mono">{log.source_ip || "—"}</dd>
                </div>
                {log.provider === "telegram" && (
                  <>
                    <div>
                      <dt className="text-xs text-muted-foreground">Update ID</dt>
                      <dd className="mt-1 font-mono">{log.telegram_update_id ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Chat ID</dt>
                      <dd className="mt-1 font-mono">{log.chat_id ?? "—"}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="mt-1">
                    {log.duration_ms !== null ? (
                      <Badge className={`${durationClass} cursor-default`}>{log.duration_ms} ms</Badge>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Handled</dt>
                  <dd className="mt-1">
                    {log.handled === 1 ? (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 cursor-default">ok</Badge>
                    ) : (
                      <Badge className="bg-red-500/15 text-red-500 border-red-500/20 cursor-default" title={log.error_message || ""}>
                        failed
                      </Badge>
                    )}
                  </dd>
                </div>
                {log.error_message && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-xs text-muted-foreground">Error</dt>
                    <dd className="mt-1 rounded-md bg-red-500/10 px-3 py-2 font-mono text-xs text-red-500">
                      {log.error_message}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw Payload</CardTitle>
              <CardDescription>{log.raw_payload.length.toLocaleString()} characters</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[560px] overflow-auto rounded-md bg-muted/50 p-4 text-xs leading-relaxed">
                <code className="font-mono">{prettyPayload(log.raw_payload)}</code>
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
