import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { toast } from "sonner"

export interface RealtimeEvent {
  type: "ticket_new" | "message_inbound" | "ticket_replied" | "ticket_status_changed" | "notifications_read"
  ticketId: number
  ticketNumber: string
  subject: string
  fromEmail: string
  timestamp: string
  unreadCount: number
}

interface RealtimeContextValue {
  connected: boolean
  unreadCount: number
  lastEvent: RealtimeEvent | null
  refreshUnread: () => Promise<void>
  setUnreadCount: (n: number) => void
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  unreadCount: 0,
  lastEvent: null,
  refreshUnread: async () => {},
  setUnreadCount: () => {},
})

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/realtime/ws`

function getWsUrl(): string {
  return WS_URL
}

export function useRealtime() {
  return useContext(RealtimeContext)
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<number | null>(null)

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/manage/api/notifications?page=1&limit=1", { credentials: "include" })
      if (res.ok) {
        const data = (await res.json()) as { unreadCount: number }
        setUnreadCount(data.unreadCount)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    function connect() {
      const protoWs = getWsUrl()
      const ws = new WebSocket(protoWs)

      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) return
        setConnected(true)
        refreshUnread()
      }

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(String(event.data)) as { type?: string }
          if (raw.type === "pong") return
          const data = raw as RealtimeEvent
          setLastEvent(data)
          if (data.unreadCount != null) setUnreadCount(data.unreadCount)

          if (data.type === "ticket_new") {
            toast.success(`New ticket ${data.ticketNumber}`, {
              description: `${data.subject} — from ${data.fromEmail}`,
              action: {
                label: "View",
                onClick: () => {
                  window.location.href = `/manage/tickets/${data.ticketNumber}`
                },
              },
            })
          } else if (data.type === "message_inbound") {
            toast.info(`New reply on ${data.ticketNumber}`, {
              description: `${data.fromEmail}: ${data.subject}`,
              action: {
                label: "View",
                onClick: () => {
                  window.location.href = `/manage/tickets/${data.ticketNumber}`
                },
              },
            })
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        setConnected(false)
        // Auto-reconnect with backoff
        if (retryRef.current) window.clearTimeout(retryRef.current)
        retryRef.current = window.setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryRef.current) window.clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [refreshUnread])

  return (
    <RealtimeContext.Provider value={{ connected, unreadCount, lastEvent, refreshUnread, setUnreadCount }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export default RealtimeProvider