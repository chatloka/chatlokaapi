import type { Ticket } from '../services/ticket'

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
  caption?: string
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

export interface TelegramCallbackButton {
  text: string
  callback_data: string
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
// Shared builders / formatters
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

export function inlineKeyboard(rows: TelegramCallbackButton[][]): Record<string, unknown> {
  return { inline_keyboard: rows }
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

/** Parse "action:part1:part2" callback data. */
export function parseCallbackData(data: string): { action: string; parts: string[] } {
  const [first, ...rest] = data.split(':')
  return { action: first, parts: rest }
}

/** Human-readable byte size, e.g. 34.8 MB. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
