import type { CloudflareBindings } from '../types'
import { TelegramApi, isAdminChat, parseCallbackData } from './botApi'
import { buildMainMenuText, defaultMenuMarkup } from './menu'
import { replyTool } from './replyFlow'
import { notifyTicketEvent, notifyStatusChange } from './notifications'
import { ticketsTool } from './tools/tickets'
import { licensesTool } from './tools/licenses'
import { pluginsTool } from './tools/plugins'
import { contactsTool } from './tools/contacts'
import { releasesTool } from './tools/releases'
import { filesTool } from './tools/files'
import { monitoringTool } from './tools/monitoring'
import { notificationsTool } from './tools/notifications'
import { TicketService, type Ticket } from '../services/ticket'
import { NotificationService } from '../services/notification'
import { ContactService } from '../services/contact'
import { LicenseService } from '../services/license'
import { AppUpdateService } from '../services/appUpdate'
import type {
  BotCtx,
  BotToolKit,
  ChatState,
  LogEntry,
  TelegramTool,
} from './types'
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from './botApi'

const ALL_TOOLS: TelegramTool[] = [
  ticketsTool,
  licensesTool,
  pluginsTool,
  contactsTool,
  releasesTool,
  filesTool,
  monitoringTool,
  notificationsTool,
]

export class TelegramBotService {
  private env: CloudflareBindings
  private db: D1Database
  private bucket: R2Bucket
  private api?: TelegramApi
  private ticketService: TicketService
  private notificationService: NotificationService
  private contactService: ContactService
  private licenseService: LicenseService
  private appUpdateService: AppUpdateService
  private tools: TelegramTool[]

  // Fast lookup maps built once from the tool registry.
  private commands = new Map<string, NonNullable<TelegramTool['commands']>[string]>()
  private callbacks = new Map<string, NonNullable<TelegramTool['callbacks']>[string]>()
  private prompts = new Map<string, NonNullable<TelegramTool['prompts']>[string]>()

  constructor(env: CloudflareBindings) {
    this.env = env
    this.db = env.DB
    this.bucket = env.PLUGINS_BUCKET
    if (env.TELEGRAM_BOT_TOKEN) this.api = new TelegramApi(env.TELEGRAM_BOT_TOKEN)
    this.ticketService = new TicketService(this.db)
    this.notificationService = new NotificationService(this.db)
    this.contactService = new ContactService(this.db)
    this.licenseService = new LicenseService(this.db)
    this.appUpdateService = new AppUpdateService(this.db)

    this.tools = ALL_TOOLS.concat([replyTool])
    for (const tool of this.tools) {
      for (const [cmd, fn] of Object.entries(tool.commands || {})) this.commands.set(cmd, fn)
      for (const [action, fn] of Object.entries(tool.callbacks || {})) this.callbacks.set(action, fn)
      for (const [action, fn] of Object.entries(tool.prompts || {})) this.prompts.set(action, fn)
    }

    // The menu commands are bound to the composed registry (menu always
    // reflects the active tools).
    const menuCommand = async (ctx: BotCtx) => {
      await ctx.reply(this.mainMenuText(), {
        parse_mode: 'HTML',
        reply_markup: defaultMenuMarkup(this.tools),
      })
    }
    this.commands.set('/start', menuCommand)
    this.commands.set('/menu', menuCommand)
    this.commands.set('/help', menuCommand)

    const cancelCommand = async (ctx: BotCtx) => {
      await this.clearChatState(ctx.chatId)
      await ctx.reply('✖️ Dialog dibatalkan.')
    }
    this.commands.set('/cancel', cancelCommand)

    // The "menu" callback (used by every tool's back-button) edits the current
    // message in place to show the main menu.
    const menuCallback = async (ctx: BotCtx, query: TelegramCallbackQuery) => {
      if (query.message) {
        await ctx.edit(query.message.message_id, this.mainMenuText(), {
          parse_mode: 'HTML',
          reply_markup: defaultMenuMarkup(this.tools),
        })
      }
    }
    this.callbacks.set('menu', menuCallback)
  }

  get configured(): boolean {
    return Boolean(this.api && this.env.TELEGRAM_ADMIN_CHAT_ID)
  }

  get apiClient(): TelegramApi | null {
    return this.api || null
  }

  get adminChatId(): number | undefined {
    if (this.env.TELEGRAM_ADMIN_CHAT_ID === undefined) return undefined
    return Number(this.env.TELEGRAM_ADMIN_CHAT_ID)
  }

  // ------------------------------------------------------------------
  // Toolkit implementation (what the tools see)
  // ------------------------------------------------------------------

  private get kit(): BotToolKit {
    const api = this.api
    if (!api) throw new Error('Telegram bot not configured')
    return {
      env: this.env,
      db: this.db,
      bucket: this.bucket,
      api,
      ticketService: this.ticketService,
      notificationService: this.notificationService,
      contactService: this.contactService,
      licenseService: this.licenseService,
      appUpdateService: this.appUpdateService,
      logAction: (e) => this.logAction(e),
      getChatState: (chatId) => this.getChatState(chatId),
      setChatState: (chatId, state) => this.setChatState(chatId, state),
      clearChatState: (chatId) => this.clearChatState(chatId),
      sendMessage: (chatId, text, opts) => api.sendMessage(chatId, text, opts),
      editMessage: (chatId, messageId, text, opts) => api.editMessageText(chatId, messageId, text, opts),
      answerCallback: (queryId, text, alert) => api.answerCallbackQuery(queryId, text, alert).then(() => undefined),
      sendDocument: (chatId, doc, filename, caption) => api.sendDocument(chatId, doc, filename, caption),
    }
  }

  private ctxFor(chatId: number): BotCtx {
    const kit = this.kit
    return {
      kit,
      chatId,
      reply: (text, opts) => kit.sendMessage(chatId, text, opts),
      edit: (messageId, text, opts) => kit.editMessage(chatId, messageId, text, opts),
      log: (entry) => kit.logAction({ ...entry, chat_id: chatId }),
    }
  }

  // ------------------------------------------------------------------
  // Persistence helpers (used by the toolkit)
  // ------------------------------------------------------------------

  private async logAction(entry: LogEntry): Promise<void> {
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

  // ------------------------------------------------------------------
  // Webhook entry point
  // ------------------------------------------------------------------

  async handleUpdate(update: TelegramUpdate, context: { raw?: string } = {}): Promise<void> {
    if (!this.configured || !this.api) return

    // Dedupe: Telegram redelivers an update when the webhook doesn't respond in
    // time. Claim the update_id up front (INSERT OR IGNORE) so a redelivered
    // update is processed exactly once. Fail-open: if the ledger table is
    // unavailable (pre-migration), process the update anyway.
    if (typeof update.update_id === 'number') {
      try {
        const claim = await this.db.prepare(
          'INSERT OR IGNORE INTO telegram_processed_updates (update_id, processed_at) VALUES (?, datetime(\'now\'))'
        ).bind(update.update_id).run()
        if ((claim.meta?.changes ?? 0) === 0) return
      } catch (err) {
        console.error('[Telegram] update dedupe failed (processing anyway):', err)
      }
    }

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
  // Message handling (commands + reply drafts + typed-input prompts)
  // ------------------------------------------------------------------

  private async handleMessage(message: TelegramMessage, updateId: number): Promise<void> {
    if (!this.api) return
    const chatId = message.chat.id
    const text = (message.text || message.caption || '').trim()

    // Multi-step flows: a pending chat state routes the next message.
    const pending = await this.getChatState(chatId)
    if (pending) {
      const promptHandler = this.prompts.get(pending.action)
      if (promptHandler) {
        await this.logAction({
          direction: 'inbound',
          action: `prompt:${pending.action}`,
          chat_id: chatId,
          from_user: message.from?.id,
          update_id: updateId,
          message: text || '[non-text]',
        })
        await promptHandler(this.ctxFor(chatId), message, pending)
        return
      }
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
    const handler = this.commands.get(cmd.toLowerCase())
    if (handler) {
      await handler(this.ctxFor(chatId), param)
      return
    }
    await this.api.sendMessage(chatId, 'Perintah tidak dikenal. Ketik /start untuk menu.')
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

    const handler = this.callbacks.get(action)
    if (handler) {
      await handler(this.ctxFor(chatId), query, parts)
      return
    }

    if (query.message) {
      await this.api.editMessageText(chatId, query.message.message_id, 'Aksi tidak dikenal.', { parse_mode: 'HTML' })
    }
  }

  // ------------------------------------------------------------------
  // Menu (composed from the tool registry)
  // ------------------------------------------------------------------

  private mainMenuText(): string {
    return buildMainMenuText(this.tools)
  }

  // ------------------------------------------------------------------
  // Notifications (outbound pushes)
  // ------------------------------------------------------------------

  async notifyTicketEvent(event: { type: string; ticket: Ticket; message?: string }): Promise<void> {
    if (!this.configured || !this.api) return
    await notifyTicketEvent(this.kit, event)
  }

  async notifyStatusChange(ticket: Ticket, newStatus: string): Promise<void> {
    if (!this.configured || !this.api) return
    await notifyStatusChange(this.kit, ticket, newStatus)
  }
}
