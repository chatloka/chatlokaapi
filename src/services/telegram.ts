import type { CloudflareBindings } from '../types'
import { TicketService, type Ticket, type TicketMessage, type TicketAttachment } from './ticket'
import { NotificationService } from './notification'
import { ResendService, type ResendAttachment } from './resend'

// ============================================================================
// Telegram Bot API – minimal typings (subset of the official Bot API schema)
// ============================================================================

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name?: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  reply_to_message?: TelegramMessage
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramWebhookInfo {
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  allowed_updates?: string[]
  last_error_message?: string
  last_error_date?: number
}

export interface TelegramBindingEnv {
  DB: D1Database
  PLUGINS_BUCKET: R2Bucket
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_ADMIN_CHAT_ID?: number | string
  TELEGRAM_WEBHOOK_SECRET?: string
  TELEGRAM_BOT_USERNAME?: string
  RESEND_API_KEY?: string
  TICKET_FROM_EMAIL?: string
  TICKET_FROM_NAME?: string
  API_BASE_URL?: string
}

// ============================================================================
// Low-level Telegram Bot API client
// ============================================================================

type TelegramApiCallResult<T> = { ok: boolean; result?: T; description?: string; error_code?: number }

export class TelegramApi {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${this.token}`
  }

  async call<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    form?: FormData,
  ): Promise<TelegramApiCallResult<T>> {
    const url = `${this.baseUrl}/${method}`
    const options: RequestInit = { method: 'POST' }

    if (form) {
      options.body = form
    } else if (Object.keys(params).length > 0) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(params)
    }

    const res = await fetch(url, options)
    return (await res.json()) as TelegramApiCallResult<T>
  }

  async getMe(): Promise<{ id: number; username?: string; first_name?: string } | null> {
    const data = await this.call<{ id: number; username?: string; first_name?: string }>('getMe')
    return data.ok && data.result ? data.result : null
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo | null> {
    const data = await this.call<TelegramWebhookInfo>('getWebhookInfo')
    return data.ok && data.result ? data.result : null
  }

  async setWebhook(params: { url: string; secret_token?: string; allowed_updates?: string[]; drop_pending_updates?: boolean; max_connections?: number }): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('setWebhook', params)
  }

  async deleteWebhook(): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteWebhook', { drop_pending_updates: true })
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    opts: { parse_mode?: 'HTML' | 'MarkdownV2'; reply_markup?: Record<string, unknown>; disable_notification?: boolean } = {},
  ): Promise<TelegramMessage | null> {
    const data = await this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}),
      ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
      ...(opts.disable_notification ? { disable_notification: true } : {}),
    })
    return data.result || null
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    opts: { parse_mode?: 'HTML' | 'MarkdownV2'; reply_markup?: Record<string, unknown> } = {},
  ): Promise<boolean> {
    const data = await this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}),
      ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
    })
    return data.ok
  }

  async sendDocument(
    chatId: number | string,
    document: Blob | string,
    filename: string,
    caption?: string,
    opts: { parse_mode?: 'HTML' | 'MarkdownV2'; reply_markup?: Record<string, unknown> } = {},
  ): Promise<{ ok: boolean; description?: string } | null> {
    const form = new FormData()
    if (typeof document === 'string') {
      form.append('document', document)
    } else {
      form.append('document', document, filename)
    }
    form.append('chat_id', String(chatId))
    if (caption) form.append('caption', caption)
    if (opts.parse_mode) form.append('parse_mode', opts.parse_mode)
    if (opts.reply_markup) form.append('reply_markup', JSON.stringify(opts.reply_markup))

    const data = await this.call<TelegramMessage>('sendDocument', {}, form)
    return data.ok ? { ok: true } : { ok: false, description: data.description }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<{ ok: boolean }> {
    const data = await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      ...(showAlert ? { show_alert: true } : {}),
    })
    return { ok: data.ok }
  }

  async getFile(fileId: string): Promise<{ file_id: string; file_size?: number; file_path?: string } | null> {
    const data = await this.call<{ file_id: string; file_size?: number; file_path?: string }>('getFile', { file_id: fileId })
    return data.result || null
  }

  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/${filePath}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`)
    return res.arrayBuffer()
  }
}

// ============================================================================
// Helper builders
// ============================================================================

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function isAdminChat(adminChatId: number | string | undefined, chatId: number | undefined): boolean {
  if (adminChatId === undefined || adminChatId === null || chatId === undefined) return false
  return String(chatId) === String(adminChatId)
}

export interface TelegramCallbackButton {
  text: string
  callback_data: string
}

export function inlineKeyboard(rows: TelegramCallbackButton[][]): Record<string, unknown> {
  return { inline_keyboard: rows }
}

export interface CodeBlock {
  name: string
  value: string | null
}

export function kvLine(name: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined || value === '' ? '—' : String(value)
  return `<b>${escapeHtml(name)}:</b> <code>${escapeHtml(v)}</code>`
}

export function ticketKeyline(ticket: Ticket): string {
  const status = (ticket.status || '').toUpperCase()
  const statusLabel = status === 'OPEN' ? '🟢' : status === 'PENDING' ? '🟡' : status === 'CLOSED' ? '🔵' : '🔘'
  return `${statusLabel} <b>${escapeHtml(ticket.ticket_number)}</b> — ${escapeHtml(ticket.subject || '')}`
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[])
  }
  return btoa(binary)
}

// ============================================================================
// High-level bot service
// ============================================================================

interface ChatAttachment {
  filename: string
  content_type: string
  file_size?: number
  r2_path?: string
  tg_file_id?: string
}

interface ChatState {
  action: string
  ticket_number?: string
  ticket_id?: number
  step?: string
  text?: string
  attachments?: ChatAttachment[]
}

function parseCallbackData(data: string): { action: string; parts: string[] } {
  const [first, ...rest] = data.split(':')
  return { action: first, parts: rest }
}

function defaultMenuMarkup(): Record<string, unknown> {
  return inlineKeyboard([
    [
      { text: '🎫 Tickets', callback_data: 'tickets' },
      { text: '📜 Licenses', callback_data: 'licenses' },
      { text: '🔌 Plugins', callback_data: 'plugins' },
    ],
    [
      { text: '📊 Stats', callback_data: 'stats' },
      { text: '🕹 Main menu', callback_data: 'menu' },
    ],
  ])
}

const TICKET_STATUSES = ['open', 'pending', 'closed'] as const

export class TelegramBotService {
  private env: CloudflareBindings
  private db: D1Database
  private bucket: R2Bucket
  private api?: TelegramApi
  private ticketService: TicketService
  private notificationService: NotificationService

  constructor(env: CloudflareBindings) {
    this.env = env
    this.db = env.DB
    this.bucket = env.PLUGINS_BUCKET
    if (env.TELEGRAM_BOT_TOKEN) this.api = new TelegramApi(env.TELEGRAM_BOT_TOKEN)
    this.ticketService = new TicketService(this.db)
    this.notificationService = new NotificationService(this.db)
  }

  get configured(): boolean {
    return Boolean(this.api && this.env.TELEGRAM_ADMIN_CHAT_ID)
  }

  get apiClient(): TelegramApi | null {
    return this.api || null
  }

  // ------------------------------------------------------------------
  // Persistence helpers
  // ------------------------------------------------------------------

  private async logAction(entry: {
    direction?: string
    chat_id?: number
    from_user?: number
    update_id?: number
    action: string
    ticket_number?: string
    target?: string
    message?: string
    payload?: string
    status?: string
    error_message?: string
  }): Promise<void> {
    try {
      await this.db.prepare(
        `INSERT INTO telegram_bot_logs (direction, chat_id, from_user, update_id, action, ticket_number, target, message, payload, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        entry.direction || 'inbound',
        entry.chat_id || null,
        entry.from_user || null,
        entry.update_id || null,
        entry.action,
        entry.ticket_number || null,
        entry.target || null,
        entry.message || null,
        entry.payload || null,
        entry.status || 'success',
        entry.error_message || null,
      ).run()
    } catch (err) {
      console.error('[Telegram] Failed to log action:', err)
    }
  }

  async getChatState(chatId: number): Promise<ChatState | null> {
    const row = await this.db.prepare('SELECT payload FROM telegram_chat_state WHERE chat_id = ? LIMIT 1').bind(chatId).first<{ payload: string }>()
    if (!row) return null
    try {
      return JSON.parse(row.payload) as ChatState
    } catch {
      return null
    }
  }

  async setChatState(chatId: number, state: ChatState): Promise<void> {
    await this.db.prepare(
      `INSERT INTO telegram_chat_state (chat_id, action, ticket_id, ticket_number, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(chat_id) DO UPDATE SET
         action = excluded.action,
         ticket_id = excluded.ticket_id,
         ticket_number = excluded.ticket_number,
         payload = excluded.payload,
         updated_at = datetime('now')`
    ).bind(
      chatId,
      state.action,
      state.ticket_id || null,
      state.ticket_number || null,
      JSON.stringify(state),
    ).run()
  }

  async clearChatState(chatId: number): Promise<void> {
    await this.db.prepare('DELETE FROM telegram_chat_state WHERE chat_id = ?').bind(chatId).run()
  }

  get adminChatId(): number | undefined {
    if (this.env.TELEGRAM_ADMIN_CHAT_ID === undefined) return undefined
    return Number(this.env.TELEGRAM_ADMIN_CHAT_ID)
  }

  // ------------------------------------------------------------------
  // Webhook entry point
  // ------------------------------------------------------------------

  async handleUpdate(update: TelegramUpdate, context: { raw?: string } = {}): Promise<void> {
    if (!this.configured || !this.api) return

    const chatId = update.callback_query?.message?.chat.id ?? update.message?.chat.id ?? update.callback_query?.from.id
    const fromUser = update.callback_query?.from.id ?? update.message?.from?.id

    // Security: only the configured admin chat may trigger actions.
    if (!isAdminChat(this.env.TELEGRAM_ADMIN_CHAT_ID, chatId)) {
      await this.logAction({
        direction: 'inbound',
        action: 'ignored_chat',
        chat_id: chatId || undefined,
        from_user: fromUser,
        update_id: update.update_id,
        message: update.message?.text || update.callback_query?.data || undefined,
        status: 'ignored',
        payload: context.raw || undefined,
      })
      return
    }

    try {
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query)
      } else if (update.message) {
        await this.handleMessage(update.message, update.update_id)
      }
    } catch (err) {
      console.error('[Telegram] handleUpdate error:', err)
      await this.logAction({
        direction: 'inbound',
        action: 'error',
        chat_id: chatId || undefined,
        from_user: fromUser,
        update_id: update.update_id,
        message: update.message?.text || update.callback_query?.data || undefined,
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
      })
      // Always answer the callback so the client doesn't wait forever.
      if (update.callback_query) {
        try {
          await this.api.answerCallbackQuery(update.callback_query.id, '⚠️ Terjadi kesalahan', true)
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Message handling (commands + reply drafts)
  // ------------------------------------------------------------------

  private async handleMessage(message: TelegramMessage, updateId: number): Promise<void> {
    if (!this.api) return
    const chatId = message.chat.id
    const text = (message.text || '').trim()

    // If a reply draft is pending, don't interpret the message as a command.
    const pending = await this.getChatState(chatId)
    if (pending && pending.action === 'reply' && message.from) {
      await this.handleReplyDraft(message, pending)
      return
    }

    await this.logAction({
      direction: 'inbound',
      action: 'message',
      chat_id: chatId,
      from_user: message.from?.id,
      update_id: updateId,
      message: text || '[non-text]',
    })

    if (text.startsWith('/')) {
      await this.handleCommand(text, chatId)
      return
    }

    // Plain non-command message: bounce a small helpful hint.
    await this.api.sendMessage(chatId, 'Gunakan /start untuk melihat menu. 😊')
  }

  private async handleCommand(text: string, chatId: number): Promise<void> {
    if (!this.api) return
    const [cmd, ...rest] = text.split(/\s+/)
    const param = rest.join(' ').trim()

    switch (cmd.toLowerCase()) {
      case '/start':
      case '/menu':
      case '/help':
        await this.api.sendMessage(chatId, this.mainMenuText(), {
          parse_mode: 'HTML',
          reply_markup: defaultMenuMarkup(),
        })
        break
      case '/ticket': {
        const ticketNumber = param.toUpperCase()
        if (!ticketNumber) {
          await this.api.sendMessage(chatId, 'Gunakan: /ticket TICKET-00001', { parse_mode: 'HTML' })
          return
        }
        const ticket = await this.ticketService.getTicketByNumber(ticketNumber)
        if (!ticket) {
          await this.api.sendMessage(chatId, `❌ Ticket <code>${escapeHtml(ticketNumber)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
          return
        }
        await this.showTicket(ticket)
        return
      }
      case '/licenses':
        await this.showLicenses()
        return
      case '/plugins':
        await this.showPlugins()
        return
      case '/stats':
        await this.showStats()
        return
      case '/cancel': {
        await this.clearChatState(chatId)
        await this.api.sendMessage(chatId, '✖️ Dialog dibatalkan.')
        return
      }
      default:
        await this.api.sendMessage(chatId, 'Perintah tidak dikenal. Ketik /start untuk menu.')
        return
    }
  }

  // ------------------------------------------------------------------
  // Reply-draft flow (multi-step; state-bound so replies never cross tickets)
  // ------------------------------------------------------------------

  private async handleReplyDraft(message: TelegramMessage, pending: ChatState): Promise<void> {
    if (!this.api || !pending.ticket_id) return
    const chatId = message.chat.id

    // Cancel any previous draft with "cancel"
    if ((message.text || '').trim().toLowerCase() === 'cancel') {
      await this.clearChatState(chatId)
      await this.api.sendMessage(chatId, '✖️ Draft reply dibatalkan.')
      return
    }

    const attachments: ChatAttachment[] = pending.attachments ? [...pending.attachments] : []
    let draftText = pending.text || ''

    if (message.text) {
      draftText = draftText ? `${draftText}\n\n${message.text}` : message.text
    }

    // File part: download to R2 and remember the path for email attach later.
    if (message.document || (message.photo && message.photo.length > 0)) {
      const file = message.document
        ? {
            file_id: message.document.file_id,
            filename: message.document.file_name || 'attachment',
            content_type: message.document.mime_type || 'application/octet-stream',
            file_size: message.document.file_size,
          }
        : {
            file_id: message.photo![message.photo!.length - 1].file_id,
            filename: `photo_${message.message_id}.jpg`,
            content_type: 'image/jpeg',
            file_size: undefined,
          }

      const path = await this.storeIncomingFile(file.file_id, `telegram-pending/${chatId}/${message.message_id}/${file.filename}`)
      if (path) {
        attachments.push({
          filename: file.filename,
          content_type: file.content_type,
          file_size: file.file_size,
          r2_path: path,
          tg_file_id: file.file_id,
        })
      }
    }

    const updated: ChatState = {
      action: 'reply',
      ticket_id: pending.ticket_id,
      ticket_number: pending.ticket_number,
      step: 'confirming',
      text: draftText,
      attachments,
    }
    await this.setChatState(chatId, updated)

    const preview = this.replyPreview(updated)
    await this.api.sendMessage(chatId, preview.text, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([
        [
          { text: '✅ Send reply', callback_data: 'reply_send' },
          { text: '❌ Cancel', callback_data: 'reply_cancel' },
        ],
      ]),
    })
  }

  private replyPreview(state: ChatState): { text: string } {
    const text = state.text || ''
    const atts = state.attachments || []
    const head = `✏️ Reply to <b>${escapeHtml(state.ticket_number || 'ticket')}</b>\n\n`
    const body = text ? escapeHtml(text) : '📄 Attachment-driven reply (no text)'
    const fileLine = atts.length > 0 ? `\n\n📎 Attachments: <b>${atts.length}</b>` : ''
    return { text: `${head}${body}${fileLine}\n\nKlik <b>Send reply</b> untuk mengirim, atau <b>Cancel</b>.` }
  }

  // ------------------------------------------------------------------
  // Callback handling (inline buttons)
  // ------------------------------------------------------------------

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    if (!this.api || !query.data) return
    const chatId = query.from.id
    await this.api.answerCallbackQuery(query.id, 'Loading…')

    const { action, parts } = parseCallbackData(query.data)

    await this.logAction({
      direction: 'inbound',
      action: `callback:${action}`,
      chat_id: chatId,
      from_user: query.from.id,
      message: query.data,
    })

    switch (action) {
      case 'tickets':
        await this.showTickets(query)
        break
      case 'licenses':
        await this.showLicenses(query)
        break
      case 'plugins':
        await this.showPlugins(query)
        break
      case 'stats':
        await this.showStats(query)
        break
      case 'menu':
        if (query.message) {
          await this.api.editMessageText(chatId, query.message.message_id, this.mainMenuText(), {
            parse_mode: 'HTML',
            reply_markup: defaultMenuMarkup(),
          })
        }
        break
      case 'ticket_view': {
        const id = Number(parts[0])
        const ticket = await this.ticketService.getTicketById(id)
        if (ticket && query.message) {
          await this.api.editMessageText(chatId, query.message.message_id, this.formatTicket(ticket), {
            parse_mode: 'HTML',
            reply_markup: this.ticketActions(ticket),
          })
        }
        break
      }
      case 'ticket_history': {
        const id = Number(parts[0])
        const ticket = await this.ticketService.getTicketById(id)
        if (!ticket || !query.message) break
        const messages = await this.ticketService.getTicketMessages(ticket.id)
        if (query.message) {
          await this.api.editMessageText(chatId, query.message.message_id, this.formatHistory(ticket, messages), {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard([[{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }]]),
          })
        }
        break
      }
      case 'ticket_attachments': {
        const id = Number(parts[0])
        const ticket = await this.ticketService.getTicketById(id)
        if (!ticket) break
        await this.showTicketAttachments(query, ticket)
        break
      }
      case 'attdownload': {
        const attId = Number(parts[0])
        await this.sendAttachmentToTelegram(query, attId)
        break
      }
      case 'reply_start': {
        const id = Number(parts[0])
        const ticket = await this.ticketService.getTicketById(id)
        if (!ticket) break
        const state: ChatState = { action: 'reply', ticket_id: ticket.id, ticket_number: ticket.ticket_number, text: '', attachments: [] }
        await this.setChatState(chatId, state)
        await this.api.sendMessage(
          chatId,
          `✏️ Menyiapkan reply untuk <b>${escapeHtml(ticket.ticket_number)}</b>.\n\n<b>Ketik pesan kamu</b> (teks / file dapat dilampirkan).\nLalu klik <b>Send reply</b> untuk konfirmasi.`,
          { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '❌ Cancel', callback_data: 'reply_cancel' }]]) },
        )
        break
      }
      case 'reply_send':
        await this.sendPendingReply(query)
        break
      case 'reply_cancel': {
        await this.clearChatState(chatId)
        await this.api.sendMessage(chatId, '✖️ Dibatalkan.')
        break
      }
      case 'status_menu': {
        const id = Number(parts[0])
        const ticket = await this.ticketService.getTicketById(id)
        if (!ticket) break
        await this.api.sendMessage(
          chatId,
          `Status saat ini: <b>${escapeHtml(ticket.status)}</b> — <b>${escapeHtml(ticket.ticket_number)}</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard([
              TICKET_STATUSES.map((s) => ({
                text: s === 'open' ? '🟢 Open' : s === 'pending' ? '🟡 Pending' : '🔵 Closed',
                callback_data: `status_set:${ticket.id}:${s}`,
              })),
              [{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }],
            ]),
          },
        )
        break
      }
      case 'status_set': {
        const id = Number(parts[0])
        const newStatus = parts[1]
        const ticket = await this.ticketService.getTicketById(id)
        if (!ticket || !newStatus) break
        await this.ticketService.updateTicket(ticket.ticket_number, { status: newStatus })

        try {
          await this.notificationService.create({
            type: 'ticket_status_changed',
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            subject: ticket.subject,
            from_email: null,
            direction: null,
          })
        } catch {
          /* ignore */
        }

        await this.api.sendMessage(
          chatId,
          `✅ Status <b>${escapeHtml(ticket.ticket_number)}</b> diubah ke <b>${escapeHtml(newStatus)}</b>`,
          { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }]]) },
        )
        break
      }
      default:
        if (query.message) {
          await this.api.editMessageText(chatId, query.message.message_id, 'Aksi tidak dikenal.', { parse_mode: 'HTML' })
        }
    }
  }

  // ------------------------------------------------------------------
  // Display methods (used by both commands and inline callbacks)
  // ------------------------------------------------------------------

  private async showTicket(ticket: Ticket, query?: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query?.from.id || this.adminChatId
    if (chatId === undefined) return
    const text = this.formatTicket(ticket)
    if (query?.message) {
      await this.api.editMessageText(chatId, query.message.message_id, text, {
        parse_mode: 'HTML',
        reply_markup: this.ticketActions(ticket),
      })
    } else {
      await this.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: this.ticketActions(ticket) })
    }
  }

  private async showTickets(query?: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query?.from.id || this.adminChatId
    if (chatId === undefined) return
    const { tickets } = await this.ticketService.getTicketsPaginated(1, 10, { status: undefined })
    const text = ['<b>🎫 Tickets terbaru</b>', ''].concat(
      tickets.length === 0
        ? ['Belum ada ticket.']
        : tickets.map((t) => ticketKeyline(t)),
    ).join('\n')

    const rows: TelegramCallbackButton[][] = []
    for (const t of tickets.slice(0, 5)) {
      rows.push([{ text: `👁 ${t.ticket_number}`, callback_data: `ticket_view:${t.id}` }])
    }
    rows.push([{ text: '🕹 Main menu', callback_data: 'menu' }])

    if (query?.message) {
      await this.api.editMessageText(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
    } else {
      await this.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
    }
  }

  private async showLicenses(query?: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query?.from.id || this.adminChatId
    if (chatId === undefined) return
    const result = await this.db.prepare(
      `SELECT purchase_code, domain, status, license_type, created_at FROM licenses ORDER BY created_at DESC LIMIT 10`
    ).all()
    const rows = (result.results || []) as Array<Record<string, unknown>>
    const text = [
      '<b>📜 Licenses terbaru</b>',
      '',
      ...(rows.length === 0
        ? ['Belum ada lisensi.']
        : rows.map((r) => `• <b>${escapeHtml(String(r.purchase_code))}</b> — <code>${escapeHtml(String(r.status || '—'))}</code>\n  <code>${escapeHtml(String(r.domain || '—'))}</code>`)),
    ].join('\n')

    if (query?.message) {
      await this.api.editMessageText(chatId, query.message.message_id, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]),
      })
    } else {
      await this.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]),
      })
    }
  }

  private async showPlugins(query?: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query?.from.id || this.adminChatId
    if (chatId === undefined) return
    const result = await this.db.prepare(
      `SELECT slug, MAX(version) as version, MAX(released_at) as released_at FROM plugin_versions GROUP BY slug ORDER BY slug LIMIT 10`
    ).all()
    const rows = (result.results || []) as Array<Record<string, unknown>>
    const text = [
      '<b>🔌 Plugins</b>',
      '',
      ...(rows.length === 0
        ? ['Belum ada plugin.']
        : rows.map((r) => `• <b>${escapeHtml(String(r.slug))}</b> — v${escapeHtml(String(r.version || '—'))}`)),
    ].join('\n')

    if (query?.message) {
      await this.api.editMessageText(chatId, query.message.message_id, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]),
      })
    } else {
      await this.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]),
      })
    }
  }

  private async showStats(query?: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query?.from.id || this.adminChatId
    if (chatId === undefined) return

    const [licenseResult, pluginResult, ticketResult, webhookResult] = await this.db.batch([
      this.db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='deactivated' THEN 1 ELSE 0 END) as deactivated, SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) as suspended FROM licenses`),
      this.db.prepare(`SELECT COUNT(DISTINCT slug) as plugins FROM plugin_versions`),
      this.db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed FROM tickets`),
      this.db.prepare(`SELECT COUNT(*) as webhook24 FROM webhook_logs WHERE created_at >= datetime('now', '-24 hours')`),
    ])

    const lic = (licenseResult.results?.[0] || {}) as Record<string, unknown>
    const plug = (pluginResult.results?.[0] || { plugins: 0 }) as Record<string, unknown>
    const tik = (ticketResult.results?.[0] || {}) as Record<string, unknown>
    const wb = (webhookResult.results?.[0] || { webhook24: 0 }) as Record<string, unknown>

    const text = [
      '<b>📊 Statistik</b>',
      '',
      kvLine('Total licenses', (lic.total as number) ?? 0),
      kvLine('Active', (lic.active as number) ?? 0),
      kvLine('Deactivated', (lic.deactivated as number) ?? 0),
      kvLine('Suspended', (lic.suspended as number) ?? 0),
      '',
      kvLine('Plugins', (plug.plugins as number) ?? 0),
      '',
      kvLine('Tickets', (tik.total as number) ?? 0),
      kvLine('Open', (tik.open as number) ?? 0),
      kvLine('Pending', (tik.pending as number) ?? 0),
      kvLine('Closed', (tik.closed as number) ?? 0),
      '',
      kvLine('Webhooks 24h', (wb.webhook24 as number) ?? 0),
    ].join('\n')

    if (query?.message) {
      await this.api.editMessageText(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]) })
    } else {
      await this.api.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]) })
    }
  }

  private async showTicketAttachments(query: TelegramCallbackQuery, ticket: Ticket): Promise<void> {
    if (!this.api) return
    const chatId = query.from.id
    const messages = await this.ticketService.getTicketMessages(ticket.id)
    const attachments: TicketAttachment[] = []
    for (const m of messages) {
      const atts = await this.ticketService.getMessageAttachments(m.id)
      attachments.push(...atts)
    }

    if (attachments.length === 0) {
      await this.api.editMessageText(chatId, query.message!.message_id, `📎 Tidak ada attachment untuk <b>${escapeHtml(ticket.ticket_number)}</b>.`, { parse_mode: 'HTML' })
      return
    }

    const rows: TelegramCallbackButton[][] = []
    for (const a of attachments.slice(0, 8)) {
      rows.push([{ text: `⬇️ ${a.filename}`, callback_data: `attdownload:${a.id}` }])
    }
    rows.push([{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }])

    if (query.message) {
      await this.api.editMessageText(chatId, query.message.message_id, `📎 <b>${attachments.length}</b> attachment(s) untuk <b>${escapeHtml(ticket.ticket_number)}</b>:\nKlik untuk mengunduh.`, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(rows),
      })
    }
  }

  private async sendAttachmentToTelegram(query: TelegramCallbackQuery, attachmentId: number): Promise<void> {
    if (!this.api) return
    const chatId = query.from.id
    const attachment = await this.ticketService.getAttachmentById(attachmentId)
    if (!attachment) {
      await this.api.sendMessage(chatId, '❌ Attachment tidak ditemukan.')
      return
    }
    try {
      const object = await this.bucket.get(attachment.r2_path)
      if (!object) {
        await this.api.sendMessage(chatId, '❌ File tidak ada di storage.')
        return
      }
      const blob = new Blob([await object.arrayBuffer()])
      const caption = escapeHtml(attachment.filename)
      await this.api.sendDocument(chatId, blob, attachment.filename, caption)
    } catch (err) {
      await this.api.sendMessage(chatId, `❌ Gagal mengunduh attachment: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async storeIncomingFile(fileId: string, key: string): Promise<string | null> {
    if (!this.api) return null
    try {
      const file = await this.api.getFile(fileId)
      if (!file?.file_path) return null
      const buffer = await this.api.downloadFile(file.file_path)
      await this.bucket.put(key, buffer)
      return key
    } catch (err) {
      console.error('[Telegram] Failed to store incoming file:', err)
      return null
    }
  }

  private async sendPendingReply(query: TelegramCallbackQuery): Promise<void> {
    if (!this.api) return
    const chatId = query.from.id
    const state = await this.getChatState(chatId)
    if (!state || state.action !== 'reply' || !state.ticket_id) {
      await this.api.sendMessage(chatId, '❌ Tidak ada draft reply aktif. Mulai dengan menekan <b>💬 Reply</b> pada sebuah ticket.', { parse_mode: 'HTML' })
      return
    }

    const ticket = await this.ticketService.getTicketById(state.ticket_id)
    if (!ticket) {
      await this.clearChatState(chatId)
      await this.api.sendMessage(chatId, '❌ Ticket tidak ditemukan. Dialog dibatalkan.')
      return
    }

    const bodyText = state.text || ''
    const attachments = state.attachments || []
    const resend = new ResendService(this.env)

    // Build HTML + text with the same footer as the MCP reply
    const sentAt = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const footerHtml = `
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">Ticket ID: ${ticket.ticket_number}</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:2px;">Sent at: ${sentAt}</div>
      </div>`
    const bodyHtml = `${bodyText.split('\n').map((l) => escapeHtml(l)).join('<br/>')}\n${footerHtml}`

    const messages = await this.ticketService.getTicketMessages(ticket.id)
    const lastMessage = messages[messages.length - 1]
    const allReferences = await this.ticketService.getAllReferences(ticket.id)

    const headers: Record<string, string> = {}
    if (lastMessage?.message_id) {
      headers['In-Reply-To'] = lastMessage.message_id
      if (allReferences.length > 0) {
        headers['References'] = [...allReferences, lastMessage.message_id].join(' ')
      }
    }

    const fromName = this.env.TICKET_FROM_NAME || 'Chatloka Support'
    const fromEmail = this.env.TICKET_FROM_EMAIL || 'contact@support.chatloka.net'
    const from = `${fromName} <${fromEmail}>`

    // Load attachment bodies from R2 for the email
    const emailAttachments: ResendAttachment[] = []
    for (const a of attachments) {
      if (!a.r2_path) continue
      try {
        const object = await this.bucket.get(a.r2_path)
        if (!object) continue
        const buffer = await object.arrayBuffer()
        const base64 = bufferToBase64(buffer)
        emailAttachments.push({ filename: a.filename, content: base64, content_type: a.content_type })
      } catch {
        /* skip broken attachment */
      }
    }

    const result = await resend.sendEmail({
      from,
      to: [ticket.from_email],
      subject: `Re: [${ticket.ticket_number}] ${ticket.subject}`,
      html: bodyHtml,
      text: bodyText + `\n\n--\nTicket ID: ${ticket.ticket_number}\nSent at: ${sentAt}`,
      headers,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    })

    const outbound = await this.ticketService.createMessage({
      ticket_id: ticket.id,
      direction: 'outbound',
      from_email: fromEmail,
      to_email: ticket.from_email,
      subject: `Re: ${ticket.subject}`,
      body_html: bodyHtml,
      body_text: bodyText,
      resend_email_id: result.id,
      has_attachments: emailAttachments.length > 0 ? 1 : 0,
    })

    // Register attachments on the message record
    for (const a of emailAttachments) {
      const att = attachments.find((x) => x.filename === a.filename)
      await this.ticketService.createAttachment({
        ticket_message_id: outbound.id,
        ticket_id: ticket.id,
        filename: a.filename,
        content_type: a.content_type || 'application/octet-stream',
        r2_path: att?.r2_path || `telegram-pending/${chatId}/unknown/${a.filename}`,
      })
    }

    await this.clearChatState(chatId)
    await this.api.sendMessage(
      chatId,
      `✅ Reply terkirim ke <b>${escapeHtml(ticket.ticket_number)}</b> (${escapeHtml(ticket.from_email)})`,
      { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }]]) },
    )

    await this.logAction({
      direction: 'outbound',
      action: 'reply_send',
      chat_id: chatId,
      ticket_number: ticket.ticket_number,
      target: ticket.from_email,
      message: bodyText,
      status: 'success',
    })
  }

  // ------------------------------------------------------------------
  // Content builders
  // ------------------------------------------------------------------

  private mainMenuText(): string {
    return [
      '<b>🎛️ Chatloka Bot</b> — kontrol license & support',
      '',
      'Command yang tersedia:',
      '  • <code>/start</code> — menu ini',
      '  • <code>/licenses</code> — daftar lisensi',
      '  • <code>/plugins</code> — daftar plugin',
      '  • <code>/stats</code> — statistik',
      '  • <code>/ticket TICKET-00001</code> — detail ticket',
      '  • <code>/cancel</code> — batalkan operasi',
    ].join('\n')
  }

  private formatTicket(ticket: Ticket): string {
    const lines = [
      ticketKeyline(ticket),
      '',
      kvLine('Status', ticket.status),
      kvLine('Priority', ticket.priority),
      kvLine('From', ticket.from_email),
      kvLine('Messages', ticket.message_count),
      kvLine('Created', ticket.created_at),
      kvLine('Last msg', ticket.last_message_at),
    ]
    return lines.join('\n')
  }

  private ticketActions(ticket: Ticket): Record<string, unknown> {
    return inlineKeyboard([
      [
        { text: '💬 Reply', callback_data: `reply_start:${ticket.id}` },
        { text: '📜 History', callback_data: `ticket_history:${ticket.id}` },
      ],
      [
        { text: '📎 Attachments', callback_data: `ticket_attachments:${ticket.id}` },
        { text: '🔄 Set status', callback_data: `status_menu:${ticket.id}` },
      ],
      [{ text: '🕹 Main menu', callback_data: 'menu' }],
    ])
  }

  private formatHistory(ticket: Ticket, messages: TicketMessage[]): string {
    const reps = messages.slice(-6)
    const lines = reps.map((m) => {
      const dir = m.direction === 'inbound' ? '📥' : '📤'
      const body = (m.body_text || '').split('\n').slice(0, 2).join(' ')
      const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body
      const atts = m.has_attachments ? ' 📎' : ''
      return `${dir} <code>${escapeHtml(m.created_at || '')}</code>\n${escapeHtml(preview || '')}${atts}`
    })

    return [
      `History <b>${escapeHtml(ticket.ticket_number)}</b>:`,
      '',
      ...(lines.length === 0 ? ['Belum ada pesan.'] : lines),
    ].join('\n')
  }

  // ------------------------------------------------------------------
  // Notifications (outbound pushes)
  // ------------------------------------------------------------------

  async notifyTicketEvent(event: { type: string; ticket: Ticket; message?: string }): Promise<void> {
    if (!this.configured || !this.api) return
    const chatId = this.adminChatId
    if (chatId === undefined) return

    const typeLabel: Record<string, string> = {
      ticket_new: '🆕 <b>NEW TICKET</b>',
      ticket_reopened: '🔄 <b>REOPENED</b>',
      message_inbound: '✉️ <b>NEW MESSAGE</b>',
    }
    const head = typeLabel[event.type] || event.type

    const text = [
      `${head} ${ticketKeyline(event.ticket)}`,
      '',
      kvLine('From', event.ticket.from_email),
      kvLine('Subject', event.ticket.subject),
      ...(event.message ? ['', escapeHtml(event.message)] : []),
    ].join('\n')

    try {
      await this.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([
          [
            { text: '👁 View', callback_data: `ticket_view:${event.ticket.id}` },
            { text: '💬 Reply', callback_data: `reply_start:${event.ticket.id}` },
          ],
          [
            { text: '📎 Attachments', callback_data: `ticket_attachments:${event.ticket.id}` },
            { text: '🔄 Set status', callback_data: `status_menu:${event.ticket.id}` },
          ],
        ]),
      })
      await this.logAction({
        direction: 'outbound',
        action: `notify:${event.type}`,
        chat_id: chatId,
        ticket_number: event.ticket.ticket_number || undefined,
        message: head,
      })
    } catch (err) {
      await this.logAction({
        direction: 'outbound',
        action: `notify:${event.type}`,
        chat_id: chatId,
        ticket_number: event.ticket.ticket_number || undefined,
        message: head,
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async notifyStatusChange(ticket: Ticket, newStatus: string): Promise<void> {
    if (!this.configured || !this.api) return
    const chatId = this.adminChatId
    if (chatId === undefined) return

    const text = [
      `🔁 Status <b>${escapeHtml(ticket.ticket_number)}</b> diubah ke <b>${escapeHtml(newStatus)}</b>`,
      '',
      kvLine('From', ticket.from_email),
      kvLine('Subject', ticket.subject),
    ].join('\n')

    try {
      await this.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard([
          [{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }],
        ]),
      })
    } catch {
      /* ignore */
    }
  }
}