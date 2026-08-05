import { run } from './d1'

export interface Notification {
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

export type NotificationInput = {
  type: 'ticket_new' | 'message_inbound' | 'ticket_replied' | 'ticket_status_changed'
  ticket_id: number
  ticket_number: string
  subject: string
  from_email?: string | null
  direction?: string | null
  summary?: string | null
}

export class NotificationService {
  constructor(private db: D1Database) {}

  /** Insert a notification and return the created row. */
  async create(input: NotificationInput): Promise<void> {
    await run(
      this.db,
      `INSERT INTO notifications (type, ticket_id, ticket_number, subject, from_email, direction, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.type,
      input.ticket_id,
      input.ticket_number,
      input.subject,
      input.from_email || null,
      input.direction || null,
      input.summary || null,
      new Date().toISOString(),
    )
  }

  /** Paginated notification feed ordered newest first. */
  async getPaginated(
    page: number,
    limit: number
  ): Promise<{ notifications: Notification[]; total: number }> {
    const offset = (page - 1) * limit

    const countRow = await this.db.prepare(
      'SELECT COUNT(*) as total FROM notifications'
    ).first<{ total: number }>()

    const data = await this.db.prepare(
      'SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all()

    return {
      notifications: (data.results || []) as unknown as Notification[],
      total: countRow?.total || 0,
    }
  }

  /** Count of unread notifications (badge badge). */
  async getUnreadCount(): Promise<number> {
    const row = await this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE read_at IS NULL'
    ).first<{ count: number }>()
    return row?.count || 0
  }

  /** Mark a single notification as read. */
  async markRead(id: number): Promise<boolean> {
    const res = await this.db.prepare(
      'UPDATE notifications SET read_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), id).run()
    return (res.meta?.changes || 0) > 0
  }

  /** Mark all notifications as read. */
  async markAllRead(): Promise<number> {
    const res = await this.db.prepare(
      'UPDATE notifications SET read_at = ? WHERE read_at IS NULL'
    ).bind(new Date().toISOString()).run()
    return res.meta?.changes || 0
  }
}