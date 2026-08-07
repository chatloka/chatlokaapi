import { first, run } from './d1'

export interface Ticket {
  id: number
  ticket_number: string
  purchase_code: string | null
  domain: string | null
  from_email: string
  from_name?: string | null
  subject: string
  status: string
  priority: string
  category?: string
  assigned_to: string | null
  last_message_at: string | null
  message_count: number
  first_response_at: string | null
  first_response_minutes: number | null
  merged_into?: number | null
  merged_at?: string | null
  contact_id?: number | null
  contact_type?: 'lead' | 'customer' | null
  latest_purchase_code?: string | null
  latest_license_type?: 'regular' | 'extended' | null
  latest_support_until?: string | null
  created_at: string
  updated_at: string
}

export interface TicketMessage {
  id: number
  ticket_id: number
  direction: string
  from_email: string
  to_email: string
  subject: string | null
  body_html: string | null
  body_text: string | null
  resend_email_id: string | null
  message_id: string | null
  in_reply_to: string | null
  references_header: string | null
  has_attachments: number
  is_automated?: number
  response_minutes: number | null
  created_at: string
}

export interface TicketAttachment {
  id: number
  ticket_message_id: number
  ticket_id: number
  filename: string
  content_type: string
  file_size: number | null
  r2_path: string
  resend_attachment_id: string | null
  content_id: string | null
  content_disposition: string | null
  created_at: string
}

export class TicketService {
  constructor(private db: D1Database) {}

  async generateTicketNumber(): Promise<string> {
    const result = await this.db.prepare('SELECT MAX(id) as max_id FROM tickets').first() as { max_id: number | null } | undefined
    const next = (result?.max_id || 0) + 1
    return `TICKET-${String(next).padStart(5, '0')}`
  }

  async getTicketsPaginated(
    page: number,
    limit: number,
    options?: { status?: string; search?: string; sort?: string; category?: string; priority?: string }
  ): Promise<{ tickets: Ticket[]; total: number }> {
    let query = `SELECT t.*, c.contact_type, c.latest_purchase_code, c.latest_license_type, c.latest_support_until
      FROM tickets t
      LEFT JOIN (
        SELECT c.id,
               c.type AS contact_type,
               cp.purchase_code AS latest_purchase_code,
               cp.license_type  AS latest_license_type,
               cp.support_until AS latest_support_until
        FROM contacts c
        LEFT JOIN contact_purchases cp ON cp.id = (
          SELECT cp2.id FROM contact_purchases cp2 WHERE cp2.contact_id = c.id
          ORDER BY cp2.support_until DESC, cp2.id DESC LIMIT 1
        )
      ) c ON c.id = t.contact_id
      WHERE 1=1`
    let countQuery = 'SELECT COUNT(*) as total FROM tickets WHERE 1=1'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (options?.status && options.status !== 'all') {
      if (options.status === 'merged') {
        const clause = ' AND status = ?'
        query += clause
        countQuery += clause
        params.push('merged')
        countParams.push('merged')
      } else {
        const clause = ' AND status = ?'
        query += clause
        countQuery += clause
        params.push(options.status)
        countParams.push(options.status)
      }
    } else {
      // Default: hide already-merged tickets from the list.
      const clause = " AND status != 'merged'"
      query += clause
      countQuery += clause
    }

    if (options?.search) {
      const clause = ' AND (ticket_number LIKE ? OR from_email LIKE ? OR subject LIKE ?)'
      query += clause
      countQuery += clause
      const searchParam = `%${options.search}%`
      params.push(searchParam, searchParam, searchParam)
      countParams.push(searchParam, searchParam, searchParam)
    }

    if (options?.category && options.category !== 'all') {
      const clause = ' AND category = ?'
      query += clause
      countQuery += clause
      params.push(options.category)
      countParams.push(options.category)
    }

    if (options?.priority && options.priority !== 'all') {
      const clause = ' AND priority = ?'
      query += clause
      countQuery += clause
      params.push(options.priority)
      countParams.push(options.priority)
    }

    const orderDir = options?.sort === 'oldest' ? 'ASC' : 'DESC'
    query += ` ORDER BY last_message_at ${orderDir} NULLS LAST, created_at ${orderDir} LIMIT ? OFFSET ?`
    params.push(limit, (page - 1) * limit)

    const [ticketsResult, countResult] = await this.db.batch([
      this.db.prepare(query).bind(...params),
      this.db.prepare(countQuery).bind(...countParams),
    ])

    const total = (countResult.results?.[0] as { total: number })?.total || 0
    return { tickets: (ticketsResult.results || []) as unknown as Ticket[], total }
  }

  async getTicketByNumber(ticketNumber: string): Promise<Ticket | null> {
    return first<Ticket>(this.db, 'SELECT * FROM tickets WHERE ticket_number = ? LIMIT 1', ticketNumber)
  }

  async getTicketById(id: number): Promise<Ticket | null> {
    return first<Ticket>(this.db, 'SELECT * FROM tickets WHERE id = ? LIMIT 1', id)
  }

  /**
   * Find a ticket whose number appears in the subject/body.
   * NOTE: Authorization (owner OR participant) is enforced by the webhook
   * via isParticipantOrOwner, so a stray ticket number in the subject of an
   * email from a non-participant sender is rejected upstream.
   */
  async findTicketBySubject(subject: string, bodyCandidates: string[] = []): Promise<Ticket | null> {
    const sources = [subject, ...bodyCandidates]
    for (const source of sources) {
      if (!source) continue
      const match = source.match(/TICKET-\d{4,6}|TKT-\d{4,6}/i)
      if (!match) continue
      const normalized = match[0].toUpperCase()
      if (normalized.startsWith('TKT-')) {
        const padded = normalized.replace('TKT-', 'TICKET-')
        const ticket = (await this.getTicketByNumber(padded)) || (await this.getTicketByNumber(normalized))
        if (ticket) return ticket
      } else {
        const ticket = await this.getTicketByNumber(normalized)
        if (ticket) return ticket
      }
    }
    return null
  }

  async findOpenTicketBySender(fromEmail: string): Promise<Ticket | null> {
    return first<Ticket>(
      this.db,
      `SELECT * FROM tickets WHERE from_email = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 1`,
      fromEmail,
    )
  }

  async reopenTicket(ticketId: number): Promise<void> {
    await run(
      this.db,
      `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?`,
      ticketId,
    )
  }

  /** Register email addresses (from, to, cc, bcc) as participants of a ticket. */
  async addParticipants(ticketId: number, emails: string[]): Promise<void> {
    const seen = new Set<string>()
    for (const raw of emails) {
      const email = raw?.trim().toLowerCase()
      if (!email || seen.has(email)) continue
      seen.add(email)
      await run(
        this.db,
        'INSERT OR IGNORE INTO ticket_participants (ticket_id, email) VALUES (?, ?)',
        ticketId,
        email,
      )
    }
  }

  /** Whether an email is the ticket owner (from_email) or a registered participant (was To/Cc/Bcc). */
  async isParticipantOrOwner(ticketId: number, email: string): Promise<boolean> {
    const from = await this.getTicketById(ticketId)
    const normalized = email?.trim().toLowerCase()
    if (from && from.from_email.trim().toLowerCase() === normalized) return true
    const row = await this.db.prepare(
      'SELECT 1 FROM ticket_participants WHERE ticket_id = ? AND email = ? LIMIT 1'
    ).bind(ticketId, normalized).first()
    return !!row
  }

  /** All registered participant emails of a ticket (excludes the owner). */
  async getParticipants(ticketId: number): Promise<string[]> {
    const result = await this.db.prepare(
      'SELECT email FROM ticket_participants WHERE ticket_id = ? ORDER BY created_at ASC'
    ).bind(ticketId).all()
    return (result.results || []).map((r) => (r as { email: string }).email)
  }

  /** Tickets that were merged into the given (target) ticket. */
  async getMergedSources(targetTicketId: number): Promise<Ticket[]> {
    const result = await this.db.prepare(
      'SELECT * FROM tickets WHERE merged_into = ? ORDER BY merged_at ASC'
    ).bind(targetTicketId).all()
    return (result.results || []) as unknown as Ticket[]
  }

  /** The target ticket a merged ticket points to, or null if not merged. */
  async getMergedIntoTicket(ticketId: number): Promise<Ticket | null> {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket?.merged_into) return null
    return this.getTicketById(ticket.merged_into)
  }

  /**
   * Merge source tickets into a target ticket.
   * Moves messages, attachments, email threads, and participants to the target,
   * registers each source owner as a participant (so replies CC them all),
   * marks the sources as 'merged' (kept for audit, hidden from the list),
   * and recomputes the target's message counters.
   * Does NOT create the audit message — callers should do that afterwards
   * so the automated "merged" message appears on top of the moved history.
   */
  async mergeTickets(
    targetTicketId: number,
    sourceTicketIds: number[],
  ): Promise<{ movedMessages: number; mergedCount: number }> {
    const target = await this.getTicketById(targetTicketId)
    if (!target) throw new Error('Target ticket not found')
    if (target.status === 'merged') throw new Error('Cannot merge into a ticket that has already been merged')

    let movedMessages = 0
    const merged = new Set<number>()

    for (const sourceId of sourceTicketIds) {
      if (sourceId === targetTicketId) continue
      const source = await this.getTicketById(sourceId)
      if (!source) throw new Error('Source ticket not found')
      if (source.status === 'merged') {
        throw new Error(`Ticket ${source.ticket_number} has already been merged`)
      }
      if (merged.has(source.id)) continue
      merged.add(source.id)

      // Move messages (and their attachments) to the target ticket
      const msgResult = await this.db.prepare(
        'UPDATE ticket_messages SET ticket_id = ? WHERE ticket_id = ?'
      ).bind(targetTicketId, sourceId).run()
      movedMessages += msgResult.meta?.changes ?? 0

      await this.db.prepare(
        'UPDATE ticket_attachments SET ticket_id = ? WHERE ticket_id = ?'
      ).bind(targetTicketId, sourceId).run()

      // Move email thread references so replies (In-Reply-To) route to the target
      await this.db.prepare(
        'UPDATE ticket_email_threads SET ticket_id = ? WHERE ticket_id = ?'
      ).bind(targetTicketId, sourceId).run()

      // Merge participants, then register the source owner as a participant too
      await this.db.prepare(
        'INSERT OR IGNORE INTO ticket_participants (ticket_id, email) SELECT ?, email FROM ticket_participants WHERE ticket_id = ?'
      ).bind(targetTicketId, sourceId).run()
      await this.db.prepare(
        'DELETE FROM ticket_participants WHERE ticket_id = ?'
      ).bind(sourceId).run()
      await this.addParticipants(targetTicketId, [source.from_email])

      // Mark source as merged (kept for audit)
      await this.db.prepare(
        `UPDATE tickets SET status = 'merged', merged_into = ?, merged_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).bind(targetTicketId, sourceId).run()
    }

    if (merged.size === 0) {
      throw new Error('No valid source tickets to merge')
    }

    // Recompute target counters from the moved history
    const agg = await this.db.prepare(
      'SELECT COUNT(*) as cnt, MAX(created_at) as last FROM ticket_messages WHERE ticket_id = ?'
    ).bind(targetTicketId).first() as { cnt: number; last: string | null } | undefined
    await this.db.prepare(
      `UPDATE tickets SET message_count = ?, last_message_at = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(agg?.cnt ?? 0, agg?.last ?? null, targetTicketId).run()

    return { movedMessages, mergedCount: merged.size }
  }

  async createTicket(data: {
    ticket_number: string
    from_email: string
    from_name?: string | null
    subject: string
    purchase_code?: string
    domain?: string
  }): Promise<Ticket> {
    const now = new Date().toISOString()
    await run(
      this.db,
      `INSERT INTO tickets (ticket_number, from_email, from_name, subject, purchase_code, domain, priority, last_message_at, message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'medium', ?, 0, ?, ?)`,
      data.ticket_number,
      data.from_email,
      data.from_name || null,
      data.subject,
      data.purchase_code || null,
      data.domain || null,
      now,
      now,
      now,
    )

    return (await this.getTicketByNumber(data.ticket_number))!
  }

  async updateTicket(ticketNumber: string, data: {
    status?: string
    priority?: string
    category?: string
    assigned_to?: string
    contact_id?: number
  }): Promise<void> {
    const updates: string[] = []
    const params: unknown[] = []

    if (data.status) {
      updates.push('status = ?')
      params.push(data.status)
    }
    if (data.priority) {
      updates.push('priority = ?')
      params.push(data.priority)
    }
    if (data.category !== undefined) {
      updates.push('category = ?')
      params.push(data.category)
    }
    if (data.assigned_to !== undefined) {
      updates.push('assigned_to = ?')
      params.push(data.assigned_to)
    }
    if (data.contact_id !== undefined) {
      updates.push('contact_id = ?')
      params.push(data.contact_id)
    }

    if (updates.length === 0) return

    updates.push('updated_at = datetime(\'now\')')
    params.push(ticketNumber)

    await this.db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE ticket_number = ?`).bind(...params).run()
  }

  async getTicketMessages(ticketId: number): Promise<TicketMessage[]> {
    const result = await this.db.prepare(
      'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC'
    ).bind(ticketId).all()
    return (result.results || []) as unknown as TicketMessage[]
  }

  async countTicketMessages(ticketId: number): Promise<number> {
    const result = await this.db.prepare(
      'SELECT COUNT(*) as count FROM ticket_messages WHERE ticket_id = ?'
    ).bind(ticketId).first<{ count: number }>()
    return result?.count ?? 0
  }

  async getTicketMessagePage(ticketId: number, offset: number, limit: number): Promise<TicketMessage[]> {
    const result = await this.db.prepare(
      'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(ticketId, limit, offset).all()
    return (result.results || []) as unknown as TicketMessage[]
  }

  async getTicketMessageById(id: number): Promise<TicketMessage | null> {
    return first<TicketMessage>(this.db, 'SELECT * FROM ticket_messages WHERE id = ? LIMIT 1', id)
  }

  async getMessageByMessageId(messageId: string): Promise<TicketMessage | null> {
    return first<TicketMessage>(this.db, 'SELECT * FROM ticket_messages WHERE message_id = ? LIMIT 1', messageId)
  }

  async createMessage(data: {
    ticket_id: number
    direction: string
    from_email: string
    to_email: string
    subject?: string | null
    body_html?: string | null
    body_text?: string | null
    resend_email_id?: string | null
    message_id?: string | null
    in_reply_to?: string | null
    references_header?: string | null
    has_attachments?: number
    is_automated?: number
  }): Promise<TicketMessage> {
    const now = new Date().toISOString()

    // Compute response time for outbound (admin) messages
    let responseMinutes: number | null = null
    if (data.direction === 'outbound') {
      const ticket = await this.getTicketById(data.ticket_id)
      if (ticket) {
        const baseTime = ticket.last_message_at || ticket.created_at
        const base = new Date(baseTime).getTime()
        const current = new Date(now).getTime()
        if (!Number.isNaN(base) && !Number.isNaN(current) && current > base) {
          const minutes = Math.round((current - base) / 60000)
          responseMinutes = Math.max(0, minutes)

          // Set first-response metrics if not set yet
          await this.db.prepare(
            `UPDATE tickets SET
               first_response_at = COALESCE(first_response_at, ?),
               first_response_minutes = COALESCE(first_response_minutes, ?)
             WHERE id = ? AND first_response_at IS NULL`
          ).bind(now, responseMinutes, data.ticket_id).run()
        }
      }
    }

    await run(
      this.db,
      `INSERT INTO ticket_messages (ticket_id, direction, from_email, to_email, subject, body_html, body_text, resend_email_id, message_id, in_reply_to, references_header, has_attachments, is_automated, response_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.ticket_id,
      data.direction,
      data.from_email,
      data.to_email,
      data.subject || null,
      data.body_html || null,
      data.body_text || null,
      data.resend_email_id || null,
      data.message_id || null,
      data.in_reply_to || null,
      data.references_header || null,
      data.has_attachments || 0,
      data.is_automated || 0,
      responseMinutes,
      now,
    )

    // Update ticket. For outbound messages (admin replied), mark as seen by admin.
    const adminSeenClause = data.direction === 'outbound'
      ? `, admin_last_seen_at = ?`
      : ''
    await this.db.prepare(
      `UPDATE tickets SET last_message_at = ?, message_count = message_count + 1, updated_at = datetime('now')${adminSeenClause} WHERE id = ?`
    ).bind(now, ...(data.direction === 'outbound' ? [now, data.ticket_id] : [data.ticket_id])).run()

    return (await this.getMessageByMessageId(data.message_id || ''))!
  }

  async createAttachment(data: {
    ticket_message_id: number
    ticket_id: number
    filename: string
    content_type: string
    file_size?: number
    r2_path: string
    resend_attachment_id?: string | null
    content_id?: string | null
    content_disposition?: string | null
  }): Promise<number> {
    const result = await run(
      this.db,
      `INSERT INTO ticket_attachments (ticket_message_id, ticket_id, filename, content_type, file_size, r2_path, resend_attachment_id, content_id, content_disposition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.ticket_message_id,
      data.ticket_id,
      data.filename,
      data.content_type,
      data.file_size || null,
      data.r2_path,
      data.resend_attachment_id || null,
      data.content_id || null,
      data.content_disposition || null,
    )
    return result.meta?.last_row_id as number
  }

  async getMessageAttachments(messageId: number): Promise<TicketAttachment[]> {
    const result = await this.db.prepare(
      'SELECT * FROM ticket_attachments WHERE ticket_message_id = ? ORDER BY created_at ASC'
    ).bind(messageId).all()
    return (result.results || []) as unknown as TicketAttachment[]
  }

  async getAttachmentById(id: number): Promise<TicketAttachment | null> {
    return first<TicketAttachment>(this.db, 'SELECT * FROM ticket_attachments WHERE id = ? LIMIT 1', id)
  }

  /** Whether a one-time attachment download token (jti) has already been used. */
  async isAttachmentTokenUsed(jti: string): Promise<boolean> {
    const row = await first<{ jti: string }>(this.db, 'SELECT jti FROM used_tokens WHERE jti = ? LIMIT 1', jti)
    return row !== null
  }

  /** Mark a one-time attachment download token (jti) as used. */
  async markAttachmentTokenAsUsed(jti: string, expiresAt: Date): Promise<void> {
    await run(this.db, 'INSERT INTO used_tokens (jti, expires_at) VALUES (?, ?)', jti, expiresAt.toISOString())
  }

  async getAllReferences(ticketId: number): Promise<string[]> {
    const result = await this.db.prepare(
      'SELECT message_id FROM ticket_email_threads WHERE ticket_id = ? ORDER BY created_at ASC'
    ).bind(ticketId).all()
    return (result.results || []).map((r) => (r as { message_id: string }).message_id).filter(Boolean)
  }

  async createEmailThread(data: {
    ticket_id: number
    message_id: string
    parent_message_id?: string | null
  }): Promise<void> {
    await run(
      this.db,
      'INSERT INTO ticket_email_threads (ticket_id, message_id, parent_message_id) VALUES (?, ?, ?)',
      data.ticket_id,
      data.message_id,
      data.parent_message_id || null,
    )
  }

  async findTicketByMessageId(messageId: string): Promise<Ticket | null> {
    return first<Ticket>(
      this.db,
      `SELECT t.* FROM tickets t
       JOIN ticket_email_threads te ON t.id = te.ticket_id
       WHERE te.message_id = ? LIMIT 1`,
      messageId,
    )
  }

  async getTicketStats(): Promise<{ total: number; open: number; pending: number; closed: number }> {
    const result = await this.db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
       FROM tickets`
    ).first()
    return (result || { total: 0, open: 0, pending: 0, closed: 0 }) as { total: number; open: number; pending: number; closed: number }
  }

  /**
   * Unread tickets: tickets whose latest message came from a customer
   * and has not been seen by the admin yet.
   */
  async getUnreadCount(): Promise<number> {
    const row = await this.db.prepare(
      `SELECT COUNT(*) as count FROM tickets t
       WHERE t.admin_last_seen_at IS NULL
          OR t.last_message_at > t.admin_last_seen_at`
    ).first<{ count: number }>()
    return row?.count || 0
  }

  async getUnreadTickets(): Promise<Ticket[]> {
    const result = await this.db.prepare(
      `SELECT * FROM tickets t
       WHERE t.admin_last_seen_at IS NULL
          OR t.last_message_at > t.admin_last_seen_at
       ORDER BY t.last_message_at DESC`
    ).all()
    return (result.results || []) as unknown as Ticket[]
  }

  /** Mark a ticket as seen by the admin (opened in detail view). */
  async markTicketSeen(ticketId: number): Promise<void> {
    await this.db.prepare(
      `UPDATE tickets SET admin_last_seen_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), ticketId).run()
  }

  /** Reset all tickets to unread (admin_last_seen_at = NULL). */
  async markAllUnread(): Promise<void> {
    await this.db.prepare(`UPDATE tickets SET admin_last_seen_at = NULL`).run()
  }

  // ============================================================
  // Analytics (all bucketing done in WIB = UTC+7)
  // ============================================================

  private toWIBMinutes(iso: string): number {
    // DB stores UTC ISO strings; WIB is UTC+7 (no DST in Indonesia)
    const utc = new Date(iso).getTime()
    return utc + 7 * 60 * 60 * 1000
  }

  /**
   * Compute ticket analytics in WIB timezone:
   *  - tickets received per weekday (WIB)
   *  - tickets received per hour-of-day (WIB)
   *  - avg first-response minutes per weekday (WIB, based on ticket created_at)
   *  - avg response minutes per hour (WIB)
   *  - slow gaps: individual replies that took the longest
   */
  async getAnalytics(): Promise<TicketAnalytics> {
    const [ticketsResult, messagesResult] = await this.db.batch([
      this.db.prepare(
        `SELECT id, ticket_number, from_email, subject, created_at,
                first_response_at, first_response_minutes
         FROM tickets ORDER BY created_at DESC LIMIT 5000`
      ),
      this.db.prepare(
        `SELECT m.id, m.ticket_id, m.created_at, m.response_minutes,
                t.ticket_number, t.subject, t.from_email
         FROM ticket_messages m
         JOIN tickets t ON t.id = m.ticket_id
         WHERE m.direction = 'outbound' AND m.response_minutes IS NOT NULL
         ORDER BY m.created_at DESC LIMIT 5000`
      ),
    ])

    const tickets = (ticketsResult.results || []) as unknown as Array<{
      id: number
      ticket_number: string
      from_email: string
      subject: string
      created_at: string
      first_response_at: string | null
      first_response_minutes: number | null
    }>
    const replies = (messagesResult.results || []) as unknown as Array<{
      id: number
      ticket_id: number
      created_at: string
      response_minutes: number
      ticket_number: string
      subject: string
      from_email: string
    }>

    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    // ---- Per-weekday buckets (WIB) ----
    const weekdayTickets: Record<number, number> = {}
    const weekdayFirstResponseSum: Record<number, number> = {}
    const weekdayFirstResponseCount: Record<number, number> = {}
    const weekdayReplyCount: Record<number, number> = {}
    const weekdayReplySum: Record<number, number> = {}

    // ---- Per-hour buckets (WIB) ----
    const hourTickets: Record<number, number> = {}
    const hourFirstResponseSum: Record<number, number> = {}
    const hourFirstResponseCount: Record<number, number> = {}
    const hourReplyCount: Record<number, number> = {}
    const hourReplySum: Record<number, number> = {}

    let totalFirstResponseSum = 0
    let totalFirstResponseCount = 0
    let totalReplySum = 0
    let totalReplyCount = 0

    for (const t of tickets) {
      const wib = this.toWIBMinutes(t.created_at)
      const weekday = new Date(wib).getUTCDay()
      const hour = new Date(wib).getUTCHours()

      weekdayTickets[weekday] = (weekdayTickets[weekday] || 0) + 1
      hourTickets[hour] = (hourTickets[hour] || 0) + 1

      if (t.first_response_minutes != null) {
        weekdayFirstResponseSum[weekday] = (weekdayFirstResponseSum[weekday] || 0) + t.first_response_minutes
        weekdayFirstResponseCount[weekday] = (weekdayFirstResponseCount[weekday] || 0) + 1
        hourFirstResponseSum[hour] = (hourFirstResponseSum[hour] || 0) + t.first_response_minutes
        hourFirstResponseCount[hour] = (hourFirstResponseCount[hour] || 0) + 1
        totalFirstResponseSum += t.first_response_minutes
        totalFirstResponseCount += 1
      }
    }

    for (const r of replies) {
      const wib = this.toWIBMinutes(r.created_at)
      const weekday = new Date(wib).getUTCDay()
      const hour = new Date(wib).getUTCHours()

      weekdayReplyCount[weekday] = (weekdayReplyCount[weekday] || 0) + 1
      weekdayReplySum[weekday] = (weekdayReplySum[weekday] || 0) + r.response_minutes
      hourReplyCount[hour] = (hourReplyCount[hour] || 0) + 1
      hourReplySum[hour] = (hourReplySum[hour] || 0) + r.response_minutes
      totalReplySum += r.response_minutes
      totalReplyCount += 1
    }

    const byWeekday = DAY_NAMES.map((name, i) => ({
      day: name,
      tickets: weekdayTickets[i] || 0,
      avgFirstResponseMinutes: weekdayFirstResponseCount[i]
        ? Math.round((weekdayFirstResponseSum[i] / weekdayFirstResponseCount[i]) * 10) / 10
        : null,
      replies: weekdayReplyCount[i] || 0,
      avgResponseMinutes: weekdayReplyCount[i]
        ? Math.round((weekdayReplySum[i] / weekdayReplyCount[i]) * 10) / 10
        : null,
    }))

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      tickets: hourTickets[h] || 0,
      avgFirstResponseMinutes: hourFirstResponseCount[h]
        ? Math.round((hourFirstResponseSum[h] / hourFirstResponseCount[h]) * 10) / 10
        : null,
      replies: hourReplyCount[h] || 0,
      avgResponseMinutes: hourReplyCount[h]
        ? Math.round((hourReplySum[h] / hourReplyCount[h]) * 10) / 10
        : null,
    }))

    // ---- Slow gaps: slowest individual replies (WIB timestamps) ----
    const slowGaps = replies
      .slice()
      .sort((a, b) => b.response_minutes - a.response_minutes)
      .slice(0, 25)
      .map((r) => {
        const wibDate = new Date(this.toWIBMinutes(r.created_at))
        return {
          id: r.id,
          ticket_number: r.ticket_number,
          subject: r.subject,
          from_email: r.from_email,
          response_minutes: r.response_minutes,
          responded_at: wibDate.toISOString(),
          weekday: DAY_NAMES[wibDate.getUTCDay()],
          hour_wib: wibDate.getUTCHours(),
        }
      })

    const totalTickets = tickets.length
    const ticketsWithResponse = totalFirstResponseCount

    return {
      summary: {
        totalTickets,
        totalReplies: totalReplyCount,
        ticketsWithFirstResponse: ticketsWithResponse,
        firstResponseRate: totalTickets > 0 ? Math.round((ticketsWithResponse / totalTickets) * 1000) / 10 : 0,
        avgFirstResponseMinutes: totalFirstResponseCount > 0
          ? Math.round((totalFirstResponseSum / totalFirstResponseCount) * 10) / 10
          : null,
        avgResponseMinutes: totalReplyCount > 0
          ? Math.round((totalReplySum / totalReplyCount) * 10) / 10
          : null,
        slowestResponseMinutes: replies.length > 0 ? Math.max(...replies.map((r) => r.response_minutes)) : null,
      },
      byWeekday,
      byHour,
      slowGaps,
    }
  }
}

export interface TicketAnalytics {
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
