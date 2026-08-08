import { escapeHtml, inlineKeyboard, kvLine, ticketKeyline, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'
import type { Ticket, TicketAttachment, TicketMessage } from '../../services/ticket'

const HISTORY_PAGE_SIZE = 5
const TICKET_STATUSES = ['open', 'pending', 'closed'] as const
const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const

function statusLabel(status: string): string {
  return status === 'open' ? '🟢 Open' : status === 'pending' ? '🟡 Pending' : status === 'closed' ? '🔵 Closed' : '🔘'
}

function priorityLabel(priority: string): string {
  return priority === 'high' ? '🔴 High' : priority === 'medium' ? '🟠 Medium' : '🟢 Low'
}

function ticketActions(ticket: Ticket): Record<string, unknown> {
  return inlineKeyboard([
    [
      { text: '💬 Reply', callback_data: `reply_start:${ticket.id}` },
      { text: '📜 History', callback_data: `ticket_history:${ticket.id}` },
    ],
    [
      { text: '📎 Attachments', callback_data: `ticket_attachments:${ticket.id}` },
      { text: '🔄 Set status', callback_data: `status_menu:${ticket.id}` },
    ],
    [
      { text: '🎚 Priority', callback_data: `ticket_priority:${ticket.id}` },
      { text: '🕹 Main menu', callback_data: 'menu' },
    ],
  ])
}

function formatTicket(ticket: Ticket): string {
  return [
    ticketKeyline(ticket),
    '',
    kvLine('Status', ticket.status),
    kvLine('Priority', ticket.priority),
    kvLine('From', ticket.from_email),
    kvLine('Messages', ticket.message_count),
    kvLine('Created', ticket.created_at),
    kvLine('Last msg', ticket.last_message_at),
  ].join('\n')
}

/** Shared ticket display — used by commands, callbacks and the reply flow. */
export async function showTicket(ctx: BotCtx, ticket: Ticket, query?: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const chatId = query?.from.id || ctx.chatId
  const text = formatTicket(ticket)
  if (query?.message) {
    await kit.editMessage(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: ticketActions(ticket) })
  } else {
    await kit.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: ticketActions(ticket) })
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function ticketCommand(ctx: BotCtx, param: string): Promise<void> {
  const { kit } = ctx
  const ticketNumber = param.trim().toUpperCase()
  if (!ticketNumber) {
    await ctx.reply('Gunakan: /ticket TICKET-00001', { parse_mode: 'HTML' })
    return
  }
  const ticket = await kit.ticketService.getTicketByNumber(ticketNumber)
  if (!ticket) {
    await ctx.reply(`❌ Ticket <code>${escapeHtml(ticketNumber)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  await showTicket(ctx, ticket)
}

async function unreadCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const tickets = await kit.ticketService.getUnreadTickets()
  if (tickets.length === 0) {
    await ctx.reply('📥 Semua ticket sudah dibaca. 👍', { parse_mode: 'HTML' })
    return
  }

  const text = [
    `📥 <b>${tickets.length}</b> ticket belum dibaca:`,
    '',
    ...tickets.slice(0, 10).map((t) => ticketKeyline(t)),
  ].join('\n')

  const rows: TelegramCallbackButton[][] = tickets.slice(0, 8).map((t) => [
    { text: `👁 ${t.ticket_number}`, callback_data: `ticket_view:${t.id}` },
  ])
  rows.push([
    { text: '✅ Tandai semua dibaca', callback_data: 'unread_readall' },
    { text: '🕹 Menu', callback_data: 'menu' },
  ])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function ticketsList(ctx: BotCtx, query: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const chatId = query.from.id
  const { tickets } = await kit.ticketService.getTicketsPaginated(1, 10, { status: undefined })
  const text = ['<b>🎫 Tickets terbaru</b>', ''].concat(
    tickets.length === 0
      ? ['Belum ada ticket.']
      : tickets.map((t) => ticketKeyline(t)),
  ).join('\n')

  const rows: TelegramCallbackButton[][] = tickets.slice(0, 5).map((t) => [
    { text: `👁 ${t.ticket_number}`, callback_data: `ticket_view:${t.id}` },
  ])
  rows.push([{ text: '📥 Unread', callback_data: 'unread' }, { text: '🕹 Main menu', callback_data: 'menu' }])

  if (query.message) {
    await kit.editMessage(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  } else {
    await kit.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  }
}

async function ticketView(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  // Opening the detail = admin has seen it (clears the unread flag).
  try {
    await kit.ticketService.markTicketSeen(ticket.id)
  } catch { /* ignore */ }
  await showTicket(ctx, ticket, query)
}

async function ticketHistory(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  await showTicketHistory(ctx, query, ticket, 1)
}

async function ticketHistoryPg(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const page = Math.max(1, Number(parts[1]) || 1)
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  await showTicketHistory(ctx, query, ticket, page)
}

async function showTicketHistory(ctx: BotCtx, query: TelegramCallbackQuery, ticket: Ticket, page: number): Promise<void> {
  const { kit } = ctx
  const msg = query.message
  if (!msg) return
  const count = await kit.ticketService.countTicketMessages(ticket.id)
  const totalPages = Math.max(1, Math.ceil(count / HISTORY_PAGE_SIZE))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const offset = (clampedPage - 1) * HISTORY_PAGE_SIZE
  const messages = await kit.ticketService.getTicketMessagePage(ticket.id, offset, HISTORY_PAGE_SIZE)

  const lines = messages.map((m) => {
    const dir = m.direction === 'inbound' ? '📥' : '📤'
    const body = (m.body_text || '').split('\n').slice(0, 2).join(' ')
    const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body
    const atts = m.has_attachments ? ' 📎' : ''
    return `${dir} <code>${escapeHtml(m.created_at || '')}</code>\n${escapeHtml(preview || '(no text)')}${atts}`
  })

  const text = [
    `History <b>${escapeHtml(ticket.ticket_number)}</b> (page ${clampedPage}/${totalPages}):`,
    '',
    ...(lines.length === 0 ? ['Belum ada pesan.'] : lines),
  ].join('\n')

  const navButtons: TelegramCallbackButton[] = []
  if (clampedPage > 1) {
    navButtons.push({ text: '⬅️ Prev', callback_data: `ticket_history_pg:${ticket.id}:${clampedPage - 1}` })
  }
  if (clampedPage < totalPages) {
    navButtons.push({ text: 'Next ➡️', callback_data: `ticket_history_pg:${ticket.id}:${clampedPage + 1}` })
  }

  const rows: TelegramCallbackButton[][] = messages.map((m) => [
    { text: `🔍 #${m.id}`, callback_data: `msg_view:${m.id}:${ticket.id}:${clampedPage}` },
  ])
  if (navButtons.length > 0) rows.push(navButtons)
  rows.push([{ text: '↩️ Ticket', callback_data: `ticket_view:${ticket.id}` }])

  await kit.editMessage(msg.chat.id, msg.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
}

async function msgView(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const messageId = Number(parts[0])
  const ticketId = Number(parts[1])
  const page = Math.max(1, Number(parts[2]) || 1)
  const message = await kit.ticketService.getTicketMessageById(messageId)
  if (!message || !query.message) return
  const attachments = await kit.ticketService.getMessageAttachments(message.id)
  const dir = message.direction === 'inbound' ? '📥 Inbound' : '📤 Outbound'
  const text = [
    `<b>${dir}</b> · <code>${escapeHtml(message.created_at || '')}</code>`,
    '',
    ...(message.body_text ? [escapeHtml(message.body_text)] : []),
    ...(attachments.length > 0 ? ['', '📎 Attachments:', ...attachments.map((a) => ` • ${escapeHtml(a.filename)}`)] : []),
  ].join('\n')

  await kit.editMessage(query.from.id, query.message.message_id, text, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([
      [
        { text: '📜 History', callback_data: `ticket_history_pg:${ticketId}:${page}` },
        { text: '💬 Reply', callback_data: `reply_start:${ticketId}` },
      ],
      [{ text: '↩️ Ticket', callback_data: `ticket_view:${ticketId}` }],
    ]),
  })
}

async function ticketAttachments(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket || !query.message) return
  const messagesWithAttachments = await kit.ticketService.getTicketMessagesWithAttachments(ticket.id, { includeBodies: false })
  const attachments: TicketAttachment[] = messagesWithAttachments.flatMap((m) => m.attachments)

  if (attachments.length === 0) {
    await kit.editMessage(query.from.id, query.message.message_id, `📎 Tidak ada attachment untuk <b>${escapeHtml(ticket.ticket_number)}</b>.`, { parse_mode: 'HTML' })
    return
  }

  const rows: TelegramCallbackButton[][] = attachments.slice(0, 8).map((a) => [
    { text: `⬇️ ${a.filename}`, callback_data: `attdownload:${a.id}` },
  ])
  rows.push([{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }])

  await kit.editMessage(query.from.id, query.message.message_id, `📎 <b>${attachments.length}</b> attachment(s) untuk <b>${escapeHtml(ticket.ticket_number)}</b>:\nKlik untuk mengunduh.`, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard(rows),
  })
}

async function attDownload(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const chatId = query.from.id
  const attachment = await kit.ticketService.getAttachmentById(Number(parts[0]))
  if (!attachment) {
    await kit.sendMessage(chatId, '❌ Attachment tidak ditemukan.')
    return
  }
  try {
    const object = await kit.bucket.get(attachment.r2_path)
    if (!object) {
      await kit.sendMessage(chatId, '❌ File tidak ada di storage.')
      return
    }
    const blob = new Blob([await object.arrayBuffer()])
    await kit.sendDocument(chatId, blob, attachment.filename, escapeHtml(attachment.filename))
  } catch (err) {
    await kit.sendMessage(chatId, `❌ Gagal mengunduh attachment: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function statusMenu(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  await kit.sendMessage(
    query.from.id,
    `Status saat ini: <b>${escapeHtml(ticket.status)}</b> — <b>${escapeHtml(ticket.ticket_number)}</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([
        TICKET_STATUSES.map((s) => ({
          text: statusLabel(s),
          callback_data: `status_set:${ticket.id}:${s}`,
        })),
        [{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }],
      ]),
    },
  )
}

async function statusSet(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const newStatus = parts[1]
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket || !newStatus) return
  await kit.ticketService.updateTicket(ticket.ticket_number, { status: newStatus })

  try {
    await kit.notificationService.create({
      type: 'ticket_status_changed',
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      from_email: null,
      direction: null,
    })
  } catch { /* ignore */ }

  await kit.sendMessage(
    query.from.id,
    `✅ Status <b>${escapeHtml(ticket.ticket_number)}</b> diubah ke <b>${escapeHtml(newStatus)}</b>`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }]]) },
  )
}

async function priorityMenu(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  await kit.sendMessage(
    query.from.id,
    `Priority saat ini: <b>${escapeHtml(ticket.priority)}</b> — <b>${escapeHtml(ticket.ticket_number)}</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([
        TICKET_PRIORITIES.map((p) => ({
          text: priorityLabel(p),
          callback_data: `ticket_priority_set:${ticket.id}:${p}`,
        })),
        [{ text: '↩️ Back', callback_data: `ticket_view:${ticket.id}` }],
      ]),
    },
  )
}

async function prioritySet(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const newPriority = parts[1]
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket || !newPriority) return
  await kit.ticketService.updateTicket(ticket.ticket_number, { priority: newPriority })
  await kit.sendMessage(
    query.from.id,
    `✅ Priority <b>${escapeHtml(ticket.ticket_number)}</b> diubah ke <b>${escapeHtml(newPriority)}</b>`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }]]) },
  )
}

async function unreadList(ctx: BotCtx, query: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const tickets = await kit.ticketService.getUnreadTickets()
  const text = [
    `📥 <b>${tickets.length}</b> ticket belum dibaca:`,
    '',
    ...(tickets.length === 0 ? ['Semua sudah dibaca. 👍'] : tickets.slice(0, 10).map((t) => ticketKeyline(t))),
  ].join('\n')
  const rows: TelegramCallbackButton[][] = tickets.slice(0, 8).map((t) => [
    { text: `👁 ${t.ticket_number}`, callback_data: `ticket_view:${t.id}` },
  ])
  rows.push([{ text: '✅ Tandai semua dibaca', callback_data: 'unread_readall' }])
  rows.push([{ text: '🕹 Menu', callback_data: 'menu' }])

  if (query.message) {
    await kit.editMessage(query.from.id, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  } else {
    await kit.sendMessage(query.from.id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  }
}

async function unreadReadAll(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  await kit.db.prepare(
    `UPDATE tickets SET admin_last_seen_at = ? WHERE admin_last_seen_at IS NULL OR last_message_at > admin_last_seen_at`
  ).bind(new Date().toISOString()).run()
  await ctx.reply('✅ Semua ticket ditandai sudah dibaca.', { parse_mode: 'HTML' })
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const ticketsTool: TelegramTool = {
  commands: {
    '/ticket': ticketCommand,
    '/unread': unreadCommand,
  },
  callbacks: {
    tickets: ticketsList,
    ticket_view: ticketView,
    ticket_history: ticketHistory,
    ticket_history_pg: ticketHistoryPg,
    msg_view: msgView,
    ticket_attachments: ticketAttachments,
    attdownload: attDownload,
    status_menu: statusMenu,
    status_set: statusSet,
    ticket_priority: priorityMenu,
    ticket_priority_set: prioritySet,
    unread: unreadList,
    unread_readall: unreadReadAll,
  },
  menuCommands: [
    { cmd: '/ticket TICKET-00001', desc: 'detail ticket' },
    { cmd: '/unread', desc: 'inbox ticket belum dibaca' },
  ],
  menuButtons: [
    [
      { text: '🎫 Tickets', callback_data: 'tickets' },
      { text: '📥 Unread', callback_data: 'unread' },
    ],
  ],
}

// Re-export for other modules that display tickets.
export type { Ticket, TicketMessage, TicketAttachment }
