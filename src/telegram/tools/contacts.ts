import { escapeHtml, inlineKeyboard, kvLine, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, ChatState, TelegramMessage, TelegramTool } from '../types'
import { EnvatoService } from '../../services/envato'
import type { ContactService } from '../../services/contact'

const SUPPORT_BADGE: Record<string, string> = {
  active: '🟢 support aktif',
  expired: '🔴 support habis',
  none: '⚪ tanpa support',
}

function contactTypeLabel(type: string): string {
  return type === 'customer' ? '👤 Customer' : '🟡 Lead'
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function contactsList(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const { contacts, total } = await kit.contactService.getContactsPaginated(1, 10, {})
  const text = [
    `👥 <b>Contacts</b> (${total})`,
    '',
    ...(contacts.length === 0
      ? ['Belum ada contact.']
      : contacts.map((c) => {
          const badge = c.type === 'customer' ? '👤' : '🟡'
          const sup = c.support_status ? ` — ${SUPPORT_BADGE[c.support_status] || ''}` : ''
          return `• ${badge} <b>${escapeHtml(c.name || c.email)}</b>${sup}\n  <code>${escapeHtml(c.email)}</code>${c.latest_purchase_code ? `\n  <code>${escapeHtml(c.latest_purchase_code)}</code>` : ''}`
        })),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = contacts.slice(0, 8).map((c) => [
    { text: `👁 ${c.name || c.email}`, callback_data: `contact_view:${c.id}` },
  ])
  buttons.push([{ text: '🕹 Main menu', callback_data: 'menu' }])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
}

async function contactCommand(ctx: BotCtx, param: string): Promise<void> {
  const { kit } = ctx
  const query = param.trim()
  if (!query) {
    await ctx.reply('Gunakan: /contact <code>EMAIL_ATAU_ID</code>', { parse_mode: 'HTML' })
    return
  }
  const id = Number(query)
  let contact = Number.isInteger(id) ? await kit.contactService.getContactDetail(id) : null
  if (!contact) {
    const byEmail = await kit.contactService.getContactByEmail(query)
    if (byEmail) contact = await kit.contactService.getContactDetail(byEmail.id)
  }
  if (!contact) {
    await ctx.reply(`❌ Contact <code>${escapeHtml(query)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  await showContactDetail(ctx, contact)
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

async function showContactDetail(ctx: BotCtx, contact: Awaited<ReturnType<ContactService['getContactDetail']>>, query?: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  if (!contact) return
  const chatId = query?.from.id || ctx.chatId

  const purchaseLines = contact.purchases.map((p) =>
    `• <code>${escapeHtml(p.purchase_code)}</code> — ${escapeHtml(p.license_type || '—')}${p.support_until ? `\n  Support: <code>${escapeHtml(p.support_until)}</code>` : ''}`
  )

  const text = [
    `${contactTypeLabel(contact.type)} <b>${escapeHtml(contact.name || contact.email)}</b>`,
    '',
    kvLine('Email', contact.email),
    kvLine('Type', contact.type),
    kvLine('Support', contact.support_status ? SUPPORT_BADGE[contact.support_status] : '—'),
    kvLine('Tickets', contact.total_tickets),
    kvLine('First contact', contact.first_contact_at || '—'),
    '',
    '💰 <b>Purchases</b>',
    ...(purchaseLines.length > 0 ? purchaseLines : ['Belum ada purchase.']),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = [
    [{ text: '💰 + Purchase code', callback_data: `contact_purchase:${contact.id}` }],
    [
      { text: '🎫 Tickets', callback_data: `contact_tickets:${contact.id}` },
      { text: '🕹 Menu', callback_data: 'menu' },
    ],
  ]

  if (query?.message) {
    await kit.editMessage(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
  } else {
    await kit.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
  }
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function contactView(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const contact = await ctx.kit.contactService.getContactDetail(Number(parts[0]))
  if (!contact) return
  await showContactDetail(ctx, contact, query)
}

async function contactTickets(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const contact = await kit.contactService.getContactDetail(Number(parts[0]))
  if (!contact) return
  const text = [
    `🎫 <b>Tickets</b> — ${escapeHtml(contact.name || contact.email)}`,
    '',
    ...(contact.tickets.length === 0
      ? ['Belum ada ticket.']
      : contact.tickets.map((t) => `• <code>${escapeHtml(t.ticket_number)}</code> — ${escapeHtml(t.status)}\n  ${escapeHtml(t.subject)}`)),
  ].join('\n')
  await kit.sendMessage(query.from.id, text, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([[{ text: '↩️ Back', callback_data: `contact_view:${contact.id}` }]]),
  })
}

async function contactPurchase(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const contact = await kit.contactService.getContactById(Number(parts[0]))
  if (!contact) return
  const state: ChatState = { action: 'contact_purchase_add', data: { contact_id: contact.id } }
  await kit.setChatState(ctx.chatId, state)
  await kit.sendMessage(
    query.from.id,
    `💰 Tambah purchase untuk <b>${escapeHtml(contact.name || contact.email)}</b>.\n\n<b>Ketik purchase code</b> (akan diverifikasi otomatis ke Envato). Ketik <code>cancel</code> untuk batal.`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '❌ Cancel', callback_data: 'reply_cancel' }]]) },
  )
}

// ---------------------------------------------------------------------------
// Prompt: waiting for a purchase code to be typed
// ---------------------------------------------------------------------------

async function purchasePrompt(ctx: BotCtx, message: TelegramMessage, state: ChatState): Promise<void> {
  const { kit } = ctx
  const contactId = Number(state.data?.contact_id || 0)
  const purchaseCode = (message.text || '').trim()
  await kit.clearChatState(ctx.chatId)

  if (!purchaseCode || purchaseCode.toLowerCase() === 'cancel') {
    await ctx.reply('✖️ Tambah purchase dibatalkan.')
    return
  }

  const contact = await kit.contactService.getContactById(contactId)
  if (!contact) {
    await ctx.reply('❌ Contact tidak ditemukan.')
    return
  }

  const envato = new EnvatoService(kit.env)
  const res = await envato.verifyPurchaseCode(purchaseCode)
  if (!res.valid || !res.purchase) {
    await ctx.reply(`❌ Purchase code <code>${escapeHtml(purchaseCode)}</code> tidak valid: ${escapeHtml(res.error || 'unknown')}`, { parse_mode: 'HTML' })
    return
  }

  const purchase = await kit.contactService.addPurchase(contactId, {
    purchase_code: purchaseCode,
    license_type: res.purchase.license,
    item_name: res.purchase.item?.name || null,
    purchase_date: res.purchase.sold_at,
    support_until: res.purchase.supported_until || null,
    source: 'envato',
  })

  await kit.logAction({ action: 'contact_purchase_add', chat_id: ctx.chatId, target: contact.email, message: purchaseCode })
  await ctx.reply(
    [
      '✅ <b>Purchase ditambahkan</b>',
      '',
      kvLine('Contact', contact.name || contact.email),
      kvLine('Code', purchase.purchase_code),
      kvLine('Item', purchase.item_name || '—'),
      kvLine('License', purchase.license_type || '—'),
      kvLine('Support until', purchase.support_until || '—'),
    ].join('\n'),
    { parse_mode: 'HTML' },
  )
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const contactsTool: TelegramTool = {
  commands: {
    '/contacts': contactsList,
    '/contact': contactCommand,
  },
  callbacks: {
    contacts: contactsList,
    contact_view: contactView,
    contact_tickets: contactTickets,
    contact_purchase: contactPurchase,
  },
  prompts: {
    contact_purchase_add: purchasePrompt,
  },
  menuCommands: [
    { cmd: '/contacts', desc: 'daftar contact' },
    { cmd: '/contact EMAIL|ID', desc: 'detail contact + purchase' },
  ],
  menuButtons: [
    [{ text: '👥 Contacts', callback_data: 'contacts' }],
  ],
}
