import { escapeHtml, inlineKeyboard, kvLine, formatBytes, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'
import { signHs256 } from '../../services/jwt'

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function releasesCommand(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const versions = await kit.appUpdateService.getAllVersions()
  const text = [
    '🚀 <b>Chatloka Releases</b>',
    '',
    ...(versions.length === 0
      ? ['Belum ada release.']
      : versions.map((v) => `• v<b>${escapeHtml(v.version)}</b>${v.is_latest ? ' ⭐ latest' : ''} — <code>${escapeHtml(String(v.released_at || '—'))}</code>\n  PHP ${escapeHtml(v.min_php_version || '8.2')} · ${formatBytes(v.file_size)}`)),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = versions.slice(0, 8).map((v) => [
    { text: `⬇️ v${v.version}${v.is_latest ? ' ⭐' : ''}`, callback_data: `rel_dl:${v.version}` },
  ])
  buttons.push([
    { text: '📋 Update logs', callback_data: 'rel_logs' },
    { text: '🕹 Menu', callback_data: 'menu' },
  ])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function relDl(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const version = parts[0] || ''
  if (!kit.env.DOWNLOAD_TOKEN_SECRET) {
    await kit.sendMessage(query.from.id, '❌ DOWNLOAD_TOKEN_SECRET belum dikonfigurasi.')
    return
  }
  const appVersion = version
    ? await kit.appUpdateService.getVersionByVersion(version)
    : await kit.appUpdateService.getLatestVersion()
  if (!appVersion) {
    await kit.sendMessage(query.from.id, `❌ Release v${escapeHtml(version)} tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  if (!appVersion.checksum) {
    await kit.sendMessage(query.from.id, `❌ Release v${escapeHtml(appVersion.version)} belum tersedia untuk download (checksum kosong).`, { parse_mode: 'HTML' })
    return
  }

  const jti = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = await signHs256(
    {
      sub: 'admin-telegram',
      type: 'app-update',
      version: appVersion.version,
      domain: 'telegram',
      jti,
      iss: 'api.chatloka.net',
      exp,
    },
    kit.env.DOWNLOAD_TOKEN_SECRET,
  )

  const baseUrl = kit.env.API_BASE_URL || 'https://api.chatloka.net'
  const filename = `chatloka-${appVersion.version}.zip`
  const downloadUrl = `${baseUrl}/downloads/${filename}`

  await kit.sendMessage(
    query.from.id,
    [
      `⬇️ <b>Release v${escapeHtml(appVersion.version)}</b>${appVersion.is_latest ? ' ⭐' : ''}`,
      '',
      kvLine('File', filename),
      kvLine('Size', formatBytes(appVersion.file_size)),
      kvLine('Checksum', appVersion.checksum),
      kvLine('Expires', new Date(exp * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })),
      '',
      `🔗 <code>${escapeHtml(downloadUrl)}</code>`,
      '',
      '⚠️ Single-use + 1 jam. Di PC gunakan:',
      `<code>curl -H "X-Download-Token: ${escapeHtml(token.slice(0, 32))}…" -OJ "${escapeHtml(downloadUrl)}"</code>`,
    ].join('\n'),
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([[{ text: '↩️ Releases', callback_data: 'releases' }]]),
    },
  )
  await kit.logAction({ action: 'release_download_link', chat_id: query.from.id, target: `v${appVersion.version}`, message: filename })
}

async function relLogs(ctx: BotCtx, query: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const { logs } = await kit.appUpdateService.getUpdateLogs(1, 10)
  const rows = logs as Array<Record<string, unknown>>

  const text = [
    '📋 <b>Update logs</b> (client-side)',
    '',
    ...(rows.length === 0
      ? ['Belum ada update.']
      : rows.map((r) => `• <b>${escapeHtml(String(r.from_version || '—'))}</b> → <b>${escapeHtml(String(r.to_version || '—'))}</b> — ${escapeHtml(String(r.status || '—'))}\n  <code>${escapeHtml(String(r.domain || '—'))}</code> · <code>${escapeHtml(String(r.downloaded_at || '—'))}</code>`)),
  ].join('\n')

  await kit.sendMessage(query.from.id, text, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([[{ text: '↩️ Releases', callback_data: 'releases' }]]),
  })
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const releasesTool: TelegramTool = {
  commands: {
    '/releases': releasesCommand,
  },
  callbacks: {
    releases: releasesCommand,
    rel_dl: relDl,
    rel_logs: relLogs,
  },
  menuCommands: [
    { cmd: '/releases', desc: 'daftar release app + download link' },
  ],
  menuButtons: [
    [{ text: '🚀 Releases', callback_data: 'releases' }],
  ],
}
