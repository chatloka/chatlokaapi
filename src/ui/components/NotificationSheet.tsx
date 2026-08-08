import { useCallback, useEffect, useRef, useState } from "react"
import { parseDbDate, toWIB } from "@/lib/dates"
import { useNavigate } from "react-router-dom"
import {
  IconBell,
  IconBellFilled,
  IconTicket,
  IconMail,
  IconMailForward,
  IconCircleCheck,
  IconCheck,
  IconChevronRight,
  IconInbox,
  IconRefresh,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useRealtime } from "@/components/RealtimeProvider"

interface NotificationItem {
  id: number
  type: string
  ticket_id: number | null
  ticket_number: string | null
  subject: string | null
  from_email: string | null
  direction: string | null
  summary: string | null
  read_at: string | null
  created_at: string
}

const TYPE_META: Record<string, { label: string; icon: typeof IconTicket; color: string }> = {
  ticket_new: { label: "New ticket", icon: IconTicket, color: "text-primary" },
  message_inbound: { label: "New reply from customer", icon: IconMail, color: "text-amber-500" },
  ticket_replied: { label: "Reply sent", icon: IconMailForward, color: "text-emerald-500" },
  ticket_status_changed: { label: "Status changed", icon: IconCircleCheck, color: "text-sky-500" },
  ticket_reopened: { label: "Ticket re-opened", icon: IconRefresh, color: "text-orange-500" },
}

function timeAgoWIB(dateStr: string) {
  const now = Date.now()
  const then = parseDbDate(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return toWIB(dateStr)
}

export function NotificationSheet() {
  const navigate = useNavigate()
  const { unreadCount, setUnreadCount, refreshUnread, lastEvent } = useRealtime()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const hasMore = notifications.length < total
  const initializedRef = useRef(false)

  const fetchPage = useCallback(
    async (pageToFetch: number, append: boolean) => {
      if (loading) return
      setLoading(true)
      if (!append) setInitialLoading(true)
      try {
        const res = await fetch(`/manage/api/notifications?page=${pageToFetch}&limit=20`, {
          credentials: "include",
        })
        if (res.ok) {
          const data = (await res.json()) as {
            notifications: NotificationItem[]
            unreadCount: number
            pagination: { total: number }
          }
          setNotifications((prev) =>
            append ? [...prev, ...data.notifications] : data.notifications
          )
          setTotal(data.pagination.total)
          setUnreadCount(data.unreadCount)
          setPage(pageToFetch)
          initializedRef.current = true
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
        setInitialLoading(false)
      }
    },
    [loading, setUnreadCount]
  )

  // Initial load when opened
  useEffect(() => {
    if (open && !initializedRef.current) {
      setNotifications([])
      setTotal(0)
      setPage(1)
      initializedRef.current = false
      fetchPage(1, false)
    }
  }, [open, fetchPage])

  // Infinite scroll: load next page when sentinel becomes visible
  useEffect(() => {
    if (!open) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          fetchPage(page + 1, true)
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [open, hasMore, loading, page, fetchPage])

  // Refresh when a realtime event arrives
  useEffect(() => {
    if (lastEvent && open && lastEvent.type !== "notifications_read") {
      fetchPage(1, false)
    }
  }, [lastEvent, open, fetchPage])

  // Refetch unread count when bell is clicked open (badge stays accurate)
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      refreshUnread()
    }
  }

  async function handleMarkAllRead() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/manage/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })))
        setUnreadCount(0)
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenNotification(item: NotificationItem) {
    setOpen(false)
    if (item.ticket_number) {
      navigate(`/manage/tickets/${item.ticket_number}`)
    }
    if (!item.read_at) {
      try {
        await fetch(`/manage/api/notifications/${item.id}/read`, {
          method: "POST",
          credentials: "include",
        })
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
        )
        setUnreadCount(Math.max(0, unreadItems - 1))
      } catch {
        /* ignore */
      }
    }
  }

  const unreadItems = notifications.filter((n) => !n.read_at).length

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {/* Bell trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="relative cursor-pointer"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        {unreadCount > 0 ? (
          <IconBellFilled className="h-5 w-5 text-primary" />
        ) : (
          <IconBell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      <SheetContent side="right" className="w-full max-w-sm gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <IconBell className="h-4 w-4" />
                Notifications
                {unreadItems > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {unreadItems} new
                  </Badge>
                )}
              </SheetTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {unreadItems > 0
                  ? `${unreadItems} unread notification${unreadItems > 1 ? "s" : ""}`
                  : "You're all caught up"}
              </p>
            </div>
            {unreadItems > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={handleMarkAllRead}
                disabled={busy}
              >
                <IconCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1">
          <ScrollArea className="h-[calc(100dvh-7.5rem)]">
            <div className="flex flex-col">
              {initialLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3 border-b border-border/50 px-4 py-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <IconInbox className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No notifications yet</p>
                  <p className="max-w-[240px] text-xs text-muted-foreground">
                    New tickets, customer replies and status changes will show up here.
                  </p>
                </div>
              ) : (
                notifications.map((item, idx) => {
                  const meta = TYPE_META[item.type] || TYPE_META.ticket_new
                  const unread = !item.read_at
                  const Icon = meta.icon
                  return (
                    <div key={item.id}>
                      {idx > 0 && <Separator />}
                      <button
                        type="button"
                        onClick={() => handleOpenNotification(item)}
                        className={cn(
                          "flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                          unread && "bg-primary/[0.04]"
                        )}
                      >
                        <div
                          className={cn(
                            "relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted",
                            meta.color
                          )}
                        >
                          <Icon className="h-4.5 w-4.5" />
                          {unread && (
                            <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold">
                              {meta.label}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {timeAgoWIB(item.created_at)}
                            </span>
                          </div>
                          {item.ticket_number && (
                            <div className="mt-0.5 flex items-center gap-1">
                              <span className="font-mono text-[11px] font-medium text-primary">
                                {item.ticket_number}
                              </span>
                              <IconChevronRight className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <p className="mt-0.5 truncate text-sm font-medium">
                            {item.subject || "No subject"}
                          </p>
                          {item.from_email && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {item.from_email}
                            </p>
                          )}
                          {item.summary && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {item.summary}
                            </p>
                          )}
                        </div>
                      </button>
                    </div>
                  )
                })
              )}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="flex items-center justify-center py-3">
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Skeleton className="h-3.5 w-3.5 rounded-full" />
                    Loading more…
                  </div>
                )}
                {!loading && hasMore && (
                  <span className="text-xs text-muted-foreground/60">Scroll for more</span>
                )}
                {!loading && !hasMore && notifications.length > 0 && (
                  <span className="text-xs text-muted-foreground/60">
                    You&apos;ve reached the beginning
                  </span>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default NotificationSheet