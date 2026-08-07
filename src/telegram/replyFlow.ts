import { escapeHtml, inlineKeyboard, bufferToBase64, type TelegramCallbackQuery } from './botApi'
import type { BotCtx, ChatState, TelegramMessage } from './types'
import { ResendService, type ResendAttachment } from '../services/resend'
import { showTicket } from './tools/tickets'

// ============================================================================
// Reply-draft flow — multi-step, state-bound so replies never cross tickets.
// The ChatState.action is 'reply'; files may be attached along the way.
// ============================================================================

async function storeIncomingFile(ctx: BotCtx, fileId: string, key: string): Promise<string | null> {
  const { kit } = ctx
  try {
    const file = await kit.api.getFile(fileId)
    if (!file?.file_path) return null
    const buffer = await kit.api.downloadFile(file.file_path)
    await kit.bucket.put(key, buffer)
    return key
  } catch (err) {
    console.error('[Telegram] Failed to store incoming file:', err)
    return null
  }
}

/** A file/text arrives while a reply draft is pending — stash it. */
async function handleReplyDraft(ctx: BotCtx, message: TelegramMessage, pending: ChatState): Promise<void> {
  const { kit } = ctx
  const chatId = message.chat.id
  const incomingText = (message.text || message.caption || '').trim()

  // Cancel any previous draft with "cancel" — return to the ticket screen.
  if (incomingText.toLowerCase() === 'cancel') {
    await kit.clearChatState(chatId)
    if (pending.ticket_id) {
      const ticket = await kit.ticketService.getTicketById(pending.ticket_id)
      if (ticket) {
        await showTicket(ctx, ticket)
        return
      }
    }
    await ctx.reply('✖️ Draft reply dibatalkan.')
    return
  }

  const attachments = pending.attachments ? [...pending.attachments] : []
  let draftText = pending.text || ''

  if (incomingText) {
    draftText = draftText ? `${draftText}\n\n${incomingText}` : incomingText
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

    const path = await storeIncomingFile(ctx, file.file_id, `telegram-pending/${chatId}/${message.message_id}/${file.filename}`)
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
  await kit.setChatState(chatId, updated)

  await ctx.reply(replyPreview(updated), {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([
      [
        { text: '✅ Send reply', callback_data: 'reply_send' },
        { text: '❌ Cancel', callback_data: 'reply_cancel' },
      ],
    ]),
  })
}

function replyPreview(state: ChatState): string {
  const text = state.text || ''
  const atts = state.attachments || []
  const head = `✏️ Reply to <b>${escapeHtml(state.ticket_number || 'ticket')}</b>\n\n`
  const body = text ? escapeHtml(text) : '📄 Attachment-driven reply (no text)'
  const fileLine = atts.length > 0 ? `\n\n📎 Attachments: <b>${atts.length}</b>` : ''
  return `${head}${body}${fileLine}\n\nKlik <b>Send reply</b> untuk mengirim, atau <b>Cancel</b>.`
}

// ---------------------------------------------------------------------------
// Callback handlers (reply_start / reply_send / reply_cancel)
// ---------------------------------------------------------------------------

async function replyStart(ctx: BotCtx, _query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const id = Number(parts[0])
  const ticket = await kit.ticketService.getTicketById(id)
  if (!ticket) return
  const state: ChatState = { action: 'reply', ticket_id: ticket.id, ticket_number: ticket.ticket_number, text: '', attachments: [] }
  await kit.setChatState(ctx.chatId, state)
  await kit.sendMessage(
    ctx.chatId,
    `✏️ Menyiapkan reply untuk <b>${escapeHtml(ticket.ticket_number)}</b>.\n\n<b>Ketik pesan kamu</b> (teks / file dapat dilampirkan).\nLalu klik <b>Send reply</b> untuk konfirmasi.`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '❌ Cancel', callback_data: 'reply_cancel' }]]) },
  )
}

async function replySend(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const state = await kit.getChatState(ctx.chatId)
  if (!state || state.action !== 'reply' || !state.ticket_id) {
    await kit.sendMessage(ctx.chatId, '❌ Tidak ada draft reply aktif. Mulai dengan menekan <b>💬 Reply</b> pada sebuah ticket.', { parse_mode: 'HTML' })
    return
  }

  const ticket = await kit.ticketService.getTicketById(state.ticket_id)
  if (!ticket) {
    await kit.clearChatState(ctx.chatId)
    await kit.sendMessage(ctx.chatId, '❌ Ticket tidak ditemukan. Dialog dibatalkan.')
    return
  }

  const bodyText = state.text || ''
  const attachments = state.attachments || []
  const resend = new ResendService(kit.env)

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

  const messages = await kit.ticketService.getTicketMessages(ticket.id)
  const lastMessage = messages[messages.length - 1]
  const allReferences = await kit.ticketService.getAllReferences(ticket.id)

  const headers: Record<string, string> = {}
  if (lastMessage?.message_id) {
    headers['In-Reply-To'] = lastMessage.message_id
    if (allReferences.length > 0) {
      headers['References'] = [...allReferences, lastMessage.message_id].join(' ')
    }
  }

  const fromName = kit.env.TICKET_FROM_NAME || 'Chatloka Support'
  const fromEmail = kit.env.TICKET_FROM_EMAIL || 'contact@support.chatloka.net'
  const from = `${fromName} <${fromEmail}>`

  const emailAttachments: ResendAttachment[] = []
  for (const a of attachments) {
    if (!a.r2_path) continue
    try {
      const object = await kit.bucket.get(a.r2_path)
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

  const outbound = await kit.ticketService.createMessage({
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

  for (const a of emailAttachments) {
    const att = attachments.find((x) => x.filename === a.filename)
    await kit.ticketService.createAttachment({
      ticket_message_id: outbound.id,
      ticket_id: ticket.id,
      filename: a.filename,
      content_type: a.content_type || 'application/octet-stream',
      r2_path: att?.r2_path || `telegram-pending/${ctx.chatId}/unknown/${a.filename}`,
    })
  }

  await kit.clearChatState(ctx.chatId)
  await kit.sendMessage(
    ctx.chatId,
    `✅ Reply terkirim ke <b>${escapeHtml(ticket.ticket_number)}</b> (${escapeHtml(ticket.from_email)})`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `ticket_view:${ticket.id}` }]]) },
  )

  await kit.logAction({
    direction: 'outbound',
    action: 'reply_send',
    chat_id: ctx.chatId,
    ticket_number: ticket.ticket_number,
    target: ticket.from_email,
    message: bodyText,
    status: 'success',
  })
}

async function replyCancel(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const state = await kit.getChatState(ctx.chatId)
  const ticketId = state?.ticket_id
  await kit.clearChatState(ctx.chatId)
  if (ticketId) {
    const ticket = await kit.ticketService.getTicketById(ticketId)
    if (ticket) {
      await showTicket(ctx, ticket)
      return
    }
  }
  await ctx.reply('✖️ Dibatalkan.')
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const replyTool = {
  callbacks: {
    reply_start: replyStart,
    reply_send: replySend,
    reply_cancel: replyCancel,
  },
  prompts: {
    reply: handleReplyDraft,
  },
}
