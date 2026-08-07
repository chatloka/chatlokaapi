import type { CloudflareBindings } from '../types'
import type { TicketService } from '../services/ticket'
import type { NotificationService } from '../services/notification'
import type { ContactService } from '../services/contact'
import type { LicenseService } from '../services/license'
import type { AppUpdateService } from '../services/appUpdate'
import type {
  TelegramApi,
  TelegramCallbackButton,
  TelegramCallbackQuery,
  TelegramMessage,
} from './botApi'

export type { TelegramMessage } from './botApi'

export interface ChatAttachment {
  filename: string
  content_type: string
  file_size?: number
  r2_path?: string
  tg_file_id?: string
}

export interface ChatState {
  action: string
  ticket_number?: string
  ticket_id?: number
  step?: string
  text?: string
  attachments?: ChatAttachment[]
  /** Arbitrary per-flow payload (e.g. pending purchase code, contact id). */
  data?: Record<string, unknown>
}

export interface SendOpts {
  parse_mode?: 'HTML' | 'MarkdownV2'
  reply_markup?: Record<string, unknown>
  disable_notification?: boolean
}

export interface LogEntry {
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
}

/**
 * Everything a tool needs to do its job. Implemented by TelegramBotService
 * (src/telegram/service.ts) so tools stay pure and independently testable.
 */
export interface BotToolKit {
  env: CloudflareBindings
  db: D1Database
  bucket: R2Bucket
  api: TelegramApi
  ticketService: TicketService
  notificationService: NotificationService
  contactService: ContactService
  licenseService: LicenseService
  appUpdateService: AppUpdateService

  logAction(entry: LogEntry): Promise<void>
  getChatState(chatId: number): Promise<ChatState | null>
  setChatState(chatId: number, state: ChatState): Promise<void>
  clearChatState(chatId: number): Promise<void>
  sendMessage(chatId: number | string, text: string, opts?: SendOpts): Promise<TelegramMessage | null>
  editMessage(chatId: number | string, messageId: number, text: string, opts?: SendOpts): Promise<boolean>
  answerCallback(queryId: string, text?: string, showAlert?: boolean): Promise<void>
  sendDocument(chatId: number | string, doc: Blob | string, filename: string, caption?: string): Promise<{ ok: boolean; description?: string } | null>
}

/** Per-chat convenience wrapper around the toolkit. */
export interface BotCtx {
  kit: BotToolKit
  chatId: number
  reply(text: string, opts?: SendOpts): Promise<TelegramMessage | null>
  edit(messageId: number, text: string, opts?: SendOpts): Promise<boolean>
  log(entry: Omit<LogEntry, 'chat_id'>): Promise<void>
}

export type CommandHandler = (c: BotCtx, param: string) => Promise<void>
export type CallbackHandler = (c: BotCtx, query: TelegramCallbackQuery, parts: string[]) => Promise<void>
export type PromptHandler = (c: BotCtx, message: TelegramMessage, state: ChatState) => Promise<void>

/**
 * A self-contained bot module. Each tool file exports one of these and the
 * service (service.ts) merges them into the router registry.
 */
export interface TelegramTool {
  /** Command → handler, e.g. { "/ticket": handler } */
  commands?: Record<string, CommandHandler>
  /** Callback action → handler, e.g. { "ticket_view": handler } */
  callbacks?: Record<string, CallbackHandler>
  /** Multi-step flows keyed by ChatState.action (typed-input flows). */
  prompts?: Record<string, PromptHandler>
  /** Command lines shown in the /start help. */
  menuCommands?: Array<{ cmd: string; desc: string }>
  /** Inline button rows added to the main menu. */
  menuButtons?: TelegramCallbackButton[][]
}
