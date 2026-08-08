import { escapeHtml, inlineKeyboard, kvLine, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, ChatState, TelegramMessage, TelegramTool } from '../types'
import type { License } from '../../types'
import { EnvatoService } from '../../services/envato'

const LICENSE_STATUSES = ['active', 'deactivated', 'suspended'] as const

function statusLabel(status: string): string {
  return status === 'active' ? '🟢 Active' : status === 'deactivated' ? '⚪ Deactivated' : status === 'suspended' ? '🔴 Suspended' : status
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function licensesList(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const result = await kit.db.prepare(
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

  const buttons: TelegramCallbackButton[][] = rows.slice(0, 8).map((r) => [
    { text: `👁 ${String(r.purchase_code).slice(0, 18)}…`, callback_data: `lic_view:${String(r.purchase_code)}` },
  ])
  buttons.push([{ text: '🕹 Main menu', callback_data: 'menu' }])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
}

async function licenseCommand(ctx: BotCtx, param: string): Promise<void> {
  const purchaseCode = param.trim()
  if (!purchaseCode) {
    await ctx.reply('Gunakan: /license <code>KODE-PEMBELIAN</code>', { parse_mode: 'HTML' })
    return
  }
  const license = await ctx.kit.licenseService.getLicenseByPurchaseCode(purchaseCode)
  if (!license) {
    await ctx.reply(`❌ Lisensi <code>${escapeHtml(purchaseCode)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  await showLicenseDetail(ctx, license)
}

async function verifyCommand(ctx: BotCtx, param: string): Promise<void> {
  const purchaseCode = param.trim()
  if (!purchaseCode) {
    await ctx.reply('Gunakan: /verify <code>KODE-PEMBELIAN</code>', { parse_mode: 'HTML' })
    return
  }
  await ctx.reply(`🔍 Memverifikasi <code>${escapeHtml(purchaseCode)}</code> ke Envato…`, { parse_mode: 'HTML' })
  const envato = new EnvatoService(ctx.kit.env)
  const result = await envato.verifyPurchaseCode(purchaseCode)
  if (!result.valid) {
    await ctx.reply(
      [
        '❌ <b>Verifikasi gagal</b>',
        '',
        kvLine('Code', purchaseCode),
        kvLine('Revoked', result.revoked ? 'Ya' : 'Tidak'),
        kvLine('Error', result.error || '—'),
      ].join('\n'),
      { parse_mode: 'HTML' },
    )
    return
  }
  const p = result.purchase
  if (!p) {
    await ctx.reply(`❌ <b>Verifikasi gagal</b>: ${escapeHtml(result.error || 'purchase data missing')}`, { parse_mode: 'HTML' })
    return
  }
  await ctx.reply(
    [
      '✅ <b>Verifikasi berhasil</b>',
      '',
      kvLine('Code', purchaseCode),
      kvLine('Item', p.item?.name || '—'),
      kvLine('License', p.license),
      kvLine('Sold at', p.sold_at),
      kvLine('Supported until', p.supported_until || '—'),
      kvLine('Buyer', p.buyer || '—'),
    ].join('\n'),
    { parse_mode: 'HTML' },
  )
}

async function createLicenseCommand(ctx: BotCtx, param: string): Promise<void> {
  // Format: /create-license CODE DOMAIN [regular|extended]
  const parts = param.trim().split(/\s+/)
  const purchaseCode = parts[0] || ''
  const domain = parts[1] || ''
  const licenseType = (parts[2] || 'regular') === 'extended' ? 'extended' : 'regular'
  if (!purchaseCode || !domain) {
    await ctx.reply('Gunakan: /create-license <code>CODE DOMAIN [regular|extended]</code>\nContoh: /create-license ABC123 example.com', { parse_mode: 'HTML' })
    return
  }
  const existing = await ctx.kit.licenseService.getLicenseByPurchaseCode(purchaseCode)
  if (existing) {
    await ctx.reply(`❌ Lisensi <code>${escapeHtml(purchaseCode)}</code> sudah ada.`, { parse_mode: 'HTML' })
    return
  }
  const license = await ctx.kit.licenseService.createLicense({ purchase_code: purchaseCode, license_type: licenseType, domain })
  await ctx.log({ action: 'license_create', message: purchaseCode })
  await ctx.reply(
    [
      '✅ <b>Lisensi dibuat</b>',
      '',
      kvLine('Code', license.purchase_code),
      kvLine('Domain', license.domain),
      kvLine('Type', license.license_type),
    ].join('\n'),
    { parse_mode: 'HTML' },
  )
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

async function showLicenseDetail(ctx: BotCtx, license: License, query?: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const chatId = query?.from.id || ctx.chatId
  const text = [
    '<b>📜 Detail Lisensi</b>',
    '',
    kvLine('Code', license.purchase_code),
    kvLine('Status', statusLabel(license.status)),
    kvLine('Type', license.license_type),
    kvLine('Domain', license.domain),
    kvLine('Item', license.item_name || '—'),
    kvLine('Buyer', license.buyer_name || '—'),
    kvLine('Email', license.buyer_email || '—'),
    kvLine('Support until', license.support_until || '—'),
    kvLine('Activated', license.activated_at || '—'),
    kvLine('Last validated', license.last_validated_at || '—'),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = [
    [
      { text: '🔄 Set status', callback_data: `lic_status:${license.purchase_code}` },
      { text: '🌐 Ganti domain', callback_data: `lic_domain:${license.purchase_code}` },
    ],
    [
      { text: '🔍 Verify Envato', callback_data: `lic_verify:${license.purchase_code}` },
      { text: '📜 Validation logs', callback_data: `lic_logs:${license.purchase_code}` },
    ],
    [{ text: '🕹 Main menu', callback_data: 'menu' }],
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

async function licView(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const license = await ctx.kit.licenseService.getLicenseByPurchaseCode(parts[0] || '')
  if (!license) return
  await showLicenseDetail(ctx, license, query)
}

async function licStatus(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const license = await kit.licenseService.getLicenseByPurchaseCode(parts[0] || '')
  if (!license) return
  await kit.sendMessage(
    query.from.id,
    `Status saat ini: <b>${statusLabel(license.status)}</b> — <code>${escapeHtml(license.purchase_code)}</code>`,
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([
        LICENSE_STATUSES.map((s) => ({
          text: statusLabel(s),
          callback_data: `lic_status_set:${license.purchase_code}:${s}`,
        })),
        [{ text: '↩️ Back', callback_data: `lic_view:${license.purchase_code}` }],
      ]),
    },
  )
}

async function licStatusSet(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const purchaseCode = parts[0] || ''
  const newStatus = parts[1] || ''
  if (!LICENSE_STATUSES.includes(newStatus as (typeof LICENSE_STATUSES)[number])) return
  const license = await kit.licenseService.getLicenseByPurchaseCode(purchaseCode)
  if (!license) return
  await kit.db.prepare('UPDATE licenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(newStatus, license.id).run()
  await kit.logAction({ action: 'license_status_set', chat_id: ctx.chatId, target: purchaseCode, message: newStatus })
  await kit.sendMessage(
    query.from.id,
    `✅ Status <code>${escapeHtml(purchaseCode)}</code> diubah ke <b>${statusLabel(newStatus)}</b>`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '👁 View', callback_data: `lic_view:${purchaseCode}` }]]) },
  )
}

async function licDomain(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const purchaseCode = parts[0] || ''
  const license = await kit.licenseService.getLicenseByPurchaseCode(purchaseCode)
  if (!license) return
  const state: ChatState = { action: 'lic_domain_set', data: { purchase_code: purchaseCode } }
  await kit.setChatState(ctx.chatId, state)
  await kit.sendMessage(
    query.from.id,
    `🌐 Domain saat ini: <code>${escapeHtml(license.domain)}</code>\n\n<b>Ketik domain baru</b> (contoh: example.com). Ketik <code>cancel</code> untuk batal.`,
    { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '❌ Cancel', callback_data: 'reply_cancel' }]]) },
  )
}

async function licVerify(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const purchaseCode = parts[0] || ''
  await ctx.kit.sendMessage(query.from.id, `🔍 Memverifikasi <code>${escapeHtml(purchaseCode)}</code>…`, { parse_mode: 'HTML' })
  const envato = new EnvatoService(ctx.kit.env)
  const result = await envato.verifyPurchaseCode(purchaseCode)
  if (!result.valid) {
    await ctx.kit.sendMessage(query.from.id, `❌ <b>Verifikasi gagal</b>: ${escapeHtml(result.error || 'invalid')}`, { parse_mode: 'HTML' })
    return
  }
  const p = result.purchase
  if (!p) {
    await ctx.kit.sendMessage(query.from.id, `❌ <b>Verifikasi gagal</b>: ${escapeHtml(result.error || 'purchase data missing')}`, { parse_mode: 'HTML' })
    return
  }
  await ctx.kit.sendMessage(
    query.from.id,
    [
      '✅ <b>Verifikasi berhasil</b>',
      '',
      kvLine('Item', p.item?.name || '—'),
      kvLine('License', p.license),
      kvLine('Sold at', p.sold_at),
      kvLine('Supported until', p.supported_until || '—'),
    ].join('\n'),
    { parse_mode: 'HTML' },
  )
}

async function licLogs(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const purchaseCode = parts[0] || ''
  const result = await kit.db.prepare(
    `SELECT v.validation_type, v.success, v.ip_address, v.user_agent, v.created_at
     FROM validation_logs v
     JOIN licenses l ON l.id = v.license_id
     WHERE l.purchase_code = ? ORDER BY v.created_at DESC LIMIT 10`
  ).bind(purchaseCode).all()
  const rows = (result.results || []) as Array<Record<string, unknown>>

  const text = [
    `📜 <b>Validation logs</b> — <code>${escapeHtml(purchaseCode)}</code>`,
    '',
    ...(rows.length === 0
      ? ['Belum ada log.']
      : rows.map((r) => `• <b>${escapeHtml(String(r.validation_type))}</b> — ${r.success === 1 ? '✅ ok' : '❌ gagal'} · <code>${escapeHtml(String(r.created_at || '—'))}</code>`)),
  ].join('\n')

  await kit.sendMessage(query.from.id, text, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([[{ text: '↩️ Back', callback_data: `lic_view:${purchaseCode}` }]]),
  })
}

// ---------------------------------------------------------------------------
// Prompt: waiting for a new domain to be typed
// ---------------------------------------------------------------------------

async function domainPrompt(ctx: BotCtx, message: TelegramMessage, state: ChatState): Promise<void> {
  const { kit } = ctx
  const purchaseCode = String(state.data?.purchase_code || '')
  const newDomain = (message.text || '').trim().toLowerCase()
  await kit.clearChatState(ctx.chatId)

  if (!newDomain || newDomain === 'cancel') {
    await ctx.reply('✖️ Ganti domain dibatalkan.')
    return
  }

  const license = await kit.licenseService.getLicenseByPurchaseCode(purchaseCode)
  if (!license) {
    await ctx.reply(`❌ Lisensi <code>${escapeHtml(purchaseCode)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }

  // Log the change to domain_history, then update.
  await kit.db.prepare(
    'INSERT INTO domain_history (license_id, old_domain, new_domain, changed_at) VALUES (?, ?, ?, datetime(\'now\'))'
  ).bind(license.id, license.domain, newDomain).run()
  await kit.db.prepare('UPDATE licenses SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(newDomain, license.id).run()

  await kit.logAction({ action: 'license_domain_set', chat_id: ctx.chatId, target: purchaseCode, message: newDomain })
  await ctx.reply(
    [
      '✅ <b>Domain diperbarui</b>',
      '',
      kvLine('Code', purchaseCode),
      kvLine('Old domain', license.domain),
      kvLine('New domain', newDomain),
    ].join('\n'),
    { parse_mode: 'HTML' },
  )
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const licensesTool: TelegramTool = {
  commands: {
    '/licenses': licensesList,
    '/license': licenseCommand,
    '/verify': verifyCommand,
    '/create-license': createLicenseCommand,
  },
  callbacks: {
    licenses: licensesList,
    lic_view: licView,
    lic_status: licStatus,
    lic_status_set: licStatusSet,
    lic_domain: licDomain,
    lic_verify: licVerify,
    lic_logs: licLogs,
  },
  prompts: {
    lic_domain_set: domainPrompt,
  },
  menuCommands: [
    { cmd: '/licenses', desc: 'daftar lisensi' },
    { cmd: '/license CODE', desc: 'detail lisensi' },
    { cmd: '/verify CODE', desc: 'verifikasi Envato' },
    { cmd: '/create-license CODE DOMAIN', desc: 'buat lisensi baru' },
  ],
  menuButtons: [
    [{ text: '📜 Licenses', callback_data: 'licenses' }],
  ],
}
