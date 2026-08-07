import { escapeHtml, inlineKeyboard, kvLine, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'
import { signHs256 } from '../../services/jwt'

interface PluginVersionRow {
  id: number
  slug: string
  version: string
  checksum: string | null
  changelog: string | null
  released_at: string | null
  is_latest: number
  download_count: number | null
  requires_chaton: string | null
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function pluginsList(ctx: BotCtx): Promise<void> {
  const { kit } = ctx
  const result = await kit.db.prepare(
    `SELECT slug, MAX(version) as version, MAX(released_at) as released_at FROM plugin_versions GROUP BY slug ORDER BY slug LIMIT 10`
  ).all()
  const rows = (result.results || []) as Array<Record<string, unknown>>
  const text = [
    '<b>🔌 Plugins</b>',
    '',
    ...(rows.length === 0
      ? ['Belum ada plugin.']
      : rows.map((r) => `• <b>${escapeHtml(String(r.slug))}</b> — v${escapeHtml(String(r.version || '—'))}`)),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = rows.map((r) => [
    { text: `🔽 ${String(r.slug)}`, callback_data: `plug_versions:${String(r.slug)}` },
  ])
  buttons.push([{ text: '🕹 Main menu', callback_data: 'menu' }])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
}

async function pluginCommand(ctx: BotCtx, param: string): Promise<void> {
  const slug = param.trim().toLowerCase()
  if (!slug) {
    await ctx.reply('Gunakan: /plugin <code>slug-plugin</code>', { parse_mode: 'HTML' })
    return
  }
  const versions = await getVersions(ctx, slug)
  if (versions.length === 0) {
    await ctx.reply(`❌ Plugin <code>${escapeHtml(slug)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  await showPluginVersions(ctx, slug, versions)
}

async function getVersions(ctx: BotCtx, slug: string): Promise<PluginVersionRow[]> {
  const result = await ctx.kit.db.prepare(
    `SELECT * FROM plugin_versions WHERE slug = ? ORDER BY released_at DESC LIMIT 15`
  ).bind(slug).all()
  return (result.results || []) as unknown as PluginVersionRow[]
}

async function showPluginVersions(ctx: BotCtx, slug: string, versions: PluginVersionRow[]): Promise<void> {
  const text = [
    `🔌 <b>${escapeHtml(slug)}</b> — ${versions.length} versi`,
    '',
    ...versions.map((v) => `• v<b>${escapeHtml(v.version)}</b>${v.is_latest ? ' ⭐' : ''} — <code>${escapeHtml(String(v.released_at || '—'))}</code>`),
  ].join('\n')

  const buttons: TelegramCallbackButton[][] = versions.slice(0, 8).map((v) => [
    { text: `⬇️ v${v.version}${v.is_latest ? ' ⭐' : ''}`, callback_data: `plug_dl:${slug}:${v.version}` },
  ])
  buttons.push([
    { text: '📦 Download logs', callback_data: `plug_dllogs:${slug}` },
    { text: '🕹 Menu', callback_data: 'menu' },
  ])

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(buttons) })
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function plugVersions(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const slug = parts[0] || ''
  const versions = await getVersions(ctx, slug)
  if (versions.length === 0) {
    await ctx.kit.sendMessage(query.from.id, `❌ Plugin <code>${escapeHtml(slug)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }
  await showPluginVersions(ctx, slug, versions)
}

async function plugDl(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const slug = parts[0] || ''
  const version = parts[1] || ''
  if (!kit.env.DOWNLOAD_TOKEN_SECRET) {
    await kit.sendMessage(query.from.id, '❌ DOWNLOAD_TOKEN_SECRET belum dikonfigurasi.')
    return
  }
  const result = await kit.db.prepare(
    'SELECT * FROM plugin_versions WHERE slug = ? AND version = ?'
  ).bind(slug, version).first<PluginVersionRow>()
  if (!result) {
    await kit.sendMessage(query.from.id, `❌ Plugin <code>${escapeHtml(slug)}</code> v${escapeHtml(version)} tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }

  const jti = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = await signHs256(
    {
      sub: 'admin-telegram',
      type: 'plugin-download',
      slug,
      version,
      domain: 'telegram',
      jti,
      iss: 'api.chatloka.net',
      exp,
    },
    kit.env.DOWNLOAD_TOKEN_SECRET,
  )

  const baseUrl = kit.env.API_BASE_URL || 'https://api.chatloka.net'
  const filename = `${slug}-${version}.zip`
  const downloadUrl = `${baseUrl}/downloads/${filename}`

  await kit.sendMessage(
    query.from.id,
    [
      `⬇️ <b>Download link</b> — ${escapeHtml(slug)} v${escapeHtml(version)}`,
      '',
      kvLine('File', filename),
      kvLine('Checksum', result.checksum || '—'),
      kvLine('Expires', new Date(exp * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })),
      '',
      `🔗 <code>${escapeHtml(downloadUrl)}</code>`,
      '',
      '⚠️ Single-use + 1 jam. Di PC gunakan:',
      `<code>curl -H "X-Download-Token: ${escapeHtml(token.slice(0, 32))}…" -OJ "${escapeHtml(downloadUrl)}"</code>`,
    ].join('\n'),
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([[{ text: '↩️ Versi', callback_data: `plug_versions:${slug}` }]]),
    },
  )
  await kit.logAction({ action: 'plugin_download_link', chat_id: query.from.id, target: slug, message: version })
}

async function plugDlLogs(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const slug = parts[0] || ''
  const result = await kit.db.prepare(
    `SELECT purchase_code, version, domain, ip_address, downloaded_at
     FROM plugin_download_logs WHERE slug = ? ORDER BY downloaded_at DESC LIMIT 10`
  ).bind(slug).all()
  const rows = (result.results || []) as Array<Record<string, unknown>>

  const text = [
    `📦 <b>Download logs</b> — <code>${escapeHtml(slug)}</code>`,
    '',
    ...(rows.length === 0
      ? ['Belum ada download.']
      : rows.map((r) => `• v${escapeHtml(String(r.version || '—'))} — <code>${escapeHtml(String(r.purchase_code || '—'))}</code>\n  <code>${escapeHtml(String(r.domain || '—'))}</code> · <code>${escapeHtml(String(r.downloaded_at || '—'))}</code>`)),
  ].join('\n')

  await kit.sendMessage(query.from.id, text, {
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard([[{ text: '↩️ Versi', callback_data: `plug_versions:${slug}` }]]),
  })
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const pluginsTool: TelegramTool = {
  commands: {
    '/plugins': pluginsList,
    '/plugin': pluginCommand,
  },
  callbacks: {
    plugins: pluginsList,
    plug_versions: plugVersions,
    plug_dl: plugDl,
    plug_dllogs: plugDlLogs,
  },
  menuCommands: [
    { cmd: '/plugins', desc: 'daftar plugin' },
    { cmd: '/plugin SLUG', desc: 'versi plugin + download link' },
  ],
  menuButtons: [
    [{ text: '🔌 Plugins', callback_data: 'plugins' }],
  ],
}
