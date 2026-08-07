import { escapeHtml, inlineKeyboard, kvLine } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function statsCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const [licenseResult, pluginResult, ticketResult, webhookResult] = await kit.db.batch([
    kit.db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='deactivated' THEN 1 ELSE 0 END) as deactivated, SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) as suspended FROM licenses`),
    kit.db.prepare(`SELECT COUNT(DISTINCT slug) as plugins FROM plugin_versions`),
    kit.db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed FROM tickets`),
    kit.db.prepare(`SELECT COUNT(*) as webhook24 FROM webhook_logs WHERE created_at >= datetime('now', '-24 hours')`),
  ])

  const lic = (licenseResult.results?.[0] || {}) as Record<string, unknown>
  const plug = (pluginResult.results?.[0] || { plugins: 0 }) as Record<string, unknown>
  const tik = (ticketResult.results?.[0] || {}) as Record<string, unknown>
  const wb = (webhookResult.results?.[0] || { webhook24: 0 }) as Record<string, unknown>

  const unread = await kit.ticketService.getUnreadCount()

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
    kvLine('Unread', unread),
    '',
    kvLine('Webhooks 24h', (wb.webhook24 as number) ?? 0),
  ].join('\n')

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]) })
}

async function apiLogsCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const result = await kit.db.prepare(
    `SELECT endpoint, method, status_code, response_time_ms, ip_address, created_at
     FROM api_logs ORDER BY id DESC LIMIT 10`
  ).all()
  const rows = (result.results || []) as Array<Record<string, unknown>>

  const text = [
    '🖥 <b>API logs terbaru</b>',
    '',
    ...(rows.length === 0
      ? ['Belum ada request.']
      : rows.map((r) => {
          const status = Number(r.status_code)
          const badge = status >= 500 ? '🔴' : status >= 400 ? '🟠' : status >= 300 ? '🟡' : '🟢'
          return `${badge} <code>${escapeHtml(String(r.method || '—'))}</code> <b>${escapeHtml(String(r.endpoint || '—'))}</b> — ${status}\n  ${escapeHtml(String(r.response_time_ms || '—'))}ms · <code>${escapeHtml(String(r.created_at || '—'))}</code>`
        })),
  ].join('\n')

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]) })
}

async function tamperCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const result = await kit.db.prepare(
    `SELECT domain, ip, failures, created_at FROM tamper_logs ORDER BY id DESC LIMIT 10`
  ).all()
  const rows = (result.results || []) as Array<Record<string, unknown>>

  const text = [
    '🛡 <b>Tamper attempts</b>',
    '',
    ...(rows.length === 0
      ? ['Aman — belum ada percobaan tamper.']
      : rows.map((r) => {
          let failureList = ''
          try {
            const parsed = JSON.parse(String(r.failures || '[]'))
            failureList = (Array.isArray(parsed) ? parsed : []).map((f: string) => f.split('/').pop()).join(', ')
          } catch { /* ignore */ }
          return `• <code>${escapeHtml(String(r.domain || '—'))}</code> — ${failureList}\n  ${escapeHtml(String(r.ip || '—'))} · <code>${escapeHtml(String(r.created_at || '—'))}</code>`
        })),
  ].join('\n')

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard([[{ text: '🕹 Main menu', callback_data: 'menu' }]]) })
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const monitoringTool: TelegramTool = {
  commands: {
    '/stats': statsCommand,
    '/api-logs': apiLogsCommand,
    '/tamper': tamperCommand,
  },
  callbacks: {
    stats: (ctx) => statsCommand(ctx),
    mon_apilogs: (ctx) => apiLogsCommand(ctx),
    mon_tamper: (ctx) => tamperCommand(ctx),
  },
  menuCommands: [
    { cmd: '/stats', desc: 'statistik ringkas' },
    { cmd: '/api-logs', desc: '10 API request terbaru' },
    { cmd: '/tamper', desc: 'percobaan tamper terbaru' },
  ],
  menuButtons: [
    [
      { text: '📊 Stats', callback_data: 'stats' },
      { text: '🖥 API logs', callback_data: 'mon_apilogs' },
    ],
  ],
}
