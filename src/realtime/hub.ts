import { DurableObject } from 'cloudflare:workers'
import type { CloudflareBindings } from '../types'

export interface RealtimeEvent {
  type: 'ticket_new' | 'message_inbound' | 'ticket_replied' | 'ticket_status_changed' | 'notifications_read'
  ticketId: number
  ticketNumber: string
  subject: string
  fromEmail: string
  timestamp: string
  unreadCount: number
}

interface Env extends CloudflareBindings {
  REALTIME_DO: DurableObjectNamespace<RealtimeHub>
}

/** Broadcast an event to all connected admin clients from anywhere in the worker. */
export async function broadcastRealtime(env: CloudflareBindings, event: RealtimeEvent): Promise<void> {
  try {
    const id = env.REALTIME_DO.idFromName('admin-hub')
    const stub = env.REALTIME_DO.get(id)
    await stub.fetch('http://realtime/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (err) {
    console.error('[Realtime] broadcast failed', err)
  }
}

/**
 * WebSocket hub backed by a Durable Object.
 * Uses the Hibernation WebSocket API so idle connections cost nothing:
 * the DO sleeps when no messages flow, and clients stay connected.
 *
 * - The Worker proxies the WebSocket upgrade to this DO via /api/realtime/ws.
 * - Other code paths call broadcastRealtime(event) to notify all connected admins.
 */
export class RealtimeHub extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade
    const upgrade = request.headers.get('Upgrade')
    if (upgrade?.toLowerCase() === 'websocket') {
      if (request.method !== 'GET') return new Response('Expected GET', { status: 400 })

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      // Hibernation API: accept the server-side socket. The DO can hibernate while
      // the socket stays open; messages wake it up to run webSocketMessage().
      this.ctx.acceptWebSocket(server)
      server.serializeAttachment({ connectedAt: new Date().toISOString() })

      return new Response(null, { status: 101, webSocket: client })
    }

    // Broadcast API: internal POST to {
    if (url.pathname === '/broadcast') {
      if (request.method !== 'POST') return new Response('Expected POST', { status: 405 })
      const payload = (await request.json()) as RealtimeEvent
      await this.broadcast(payload)
      return new Response('ok')
    }

    return new Response('Not found', { status: 404 })
  }

  /** Send an event to every connected client (hibernating or not). */
  async broadcast(payload: RealtimeEvent): Promise<void> {
    const sockets = this.ctx.getWebSockets()
    const data = JSON.stringify(payload)
    for (const ws of sockets) {
      try {
        ws.send(data)
      } catch (err) {
        console.error('[RealtimeDO] send failed', err)
      }
    }
  }

  /** Client ping to keep connection alive (also resets idle timers). */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === 'string' ? message : ''
      if (text === '{"type":"ping"}') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {
      /* ignore malformed */
    }
  }

  /** Client disconnected - nothing to clean up (socket already dropped). */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // No-op: socket is already dropped by the runtime; kept for clarity.
    void ws
    void code
    void reason
    void wasClean
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    void ws
    void error
  }
}