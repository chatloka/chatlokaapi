import { escapeHtml, inlineKeyboard, kvLine, ticketKeyline } from './botApi'
import type { BotToolKit } from './types'
import type { Ticket } from '../services/ticket'

// ============================================================================
// Outbound pushes (admin notifications)
// ============================================================================

export async function notifyTicketEvent(
  kit: BotToolKit,
  event: { type: string; ticket: Ticket; message?: string },
): Promise<void> {
  const chatId = Number(kit.env.TELEGRAM_ADMIN_CHAT_ID)
  if (!chatId || !kit.api) return

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
    await kit.sendMessage(chatId, text, {
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
    await kit.logAction({
      direction: 'outbound',
      action: `notify:${event.type}`,
      chat_id: chatId,
      ticket_number: event.ticket.ticket_number || undefined,
      message: head,
    })
  } catch (err) {
    await kit.logAction({
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

export async function notifyStatusChange(kit: BotToolKit, ticket: Ticket, newStatus: string): Promise<void> {
  const chatId = Number(kit.env.TELEGRAM_ADMIN_CHAT_ID)
  if (!chatId || !kit.api) return

  const text = [
    `🔁 Status <b>${escapeHtml(ticket.ticket_number)}</b> diubah ke <b>${escapeHtml(newStatus)}</b>`,
    '',
    kvLine('From', ticket.from_email),
    kvLine('Subject', ticket.subject),
  ].join('\n')

  try {
    await kit.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([
        [{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }],
      ]),
    })
  } catch {
    /* ignore */
  }
}
