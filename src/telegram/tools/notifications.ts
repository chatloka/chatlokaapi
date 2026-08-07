import { escapeHtml, inlineKeyboard, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'

const NOTIF_TYPES: Record<string, string> = {
  ticket_new: '🆕',
  message_inbound: '✉️',
  ticket_replied: '📤',
  ticket_status_changed: '🔁',
  ticket_reopened: '🔄',
}

async function notificationsCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const { notifications, total } = await kit.notificationService.getPaginated(1, 10)
  const unread = await kit.notificationService.getUnreadCount()

  const text = [
    `🔔 <b>Notifications</b> (${total})${unread > 0 ? ` — ${unread} belum dibaca` : ''}`,
    '',
    ...(notifications.length === 0
      ? ['Belum ada notifikasi.']
      : notifications.map((n) => {
          const icon = NOTIF_TYPES[n.type] || '🔔'
          const isUnread = !n.read_at
          return `${icon}${isUnread ? ' <b>●</b>' : ''} <code>${escapeHtml(n.ticket_number || '—')}</code>\n  ${escapeHtml(n.subject || n.summary || '—')}\n  <code>${escapeHtml(String(n.created_at || ''))}</code>`
        })),
  ].join('\n')

  const rows: TelegramCallbackButton[][] = notifications.slice(0, 6).map((n) => [
    { text: `${NOTIF_TYPES[n.type] || '🔔'} ${n.ticket_number || `#${n.id}`}`, callback_data: `notif_read:${n.id}` },
  ])
  rows.push([
    { text: '✅ Tandai semua dibaca', callback_data: 'notif_readall' },
    { text: '🕹 Menu', callback_data: 'menu' },
  ])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
}

async function notifRead(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  await ctx.kit.notificationService.markRead(Number(parts[0]))
  await ctx.kit.answerCallback(query.id, 'Ditandai dibaca ✅')
}

async function notifReadAll(ctx: BotCtx): Promise<void> {
  const marked = await ctx.kit.notificationService.markAllRead()
  await ctx.reply(`✅ ${marked} notifikasi ditandai dibaca.`)
}

export const notificationsTool: TelegramTool = {
  commands: {
    '/notifs': notificationsCommand,
  },
  callbacks: {
    notifs: notificationsCommand,
    notif_read: notifRead,
    notif_readall: notifReadAll,
  },
  menuCommands: [
    { cmd: '/notifs', desc: 'notifikasi + tandai dibaca' },
  ],
  menuButtons: [
    [{ text: '🔔 Notifs', callback_data: 'notifs' }],
  ],
}
