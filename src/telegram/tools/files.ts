import { escapeHtml, inlineKeyboard, formatBytes, type TelegramCallbackButton, type TelegramCallbackQuery } from '../botApi'
import type { BotCtx, TelegramTool } from '../types'
import { FileManagerService, type R2FileEntry } from '../../services/fileManager'
import { signHs256 } from '../../services/jwt'

const DEFAULT_ROOT = 'files/'

function fileIcon(entry: R2FileEntry): string {
  if (entry.kind === 'folder') return '📁'
  const ext = entry.name.split('.').pop()?.toLowerCase() || ''
  if (['md', 'markdown'].includes(ext)) return '📝'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼'
  if (['pdf'].includes(ext)) return '📕'
  if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return '🗜'
  if (['csv', 'xlsx', 'xls'].includes(ext)) return '📊'
  if (['txt', 'log', 'json', 'php', 'js', 'ts', 'sql'].includes(ext)) return '📄'
  return '📎'
}

function safeKey(key: string): string {
  return key.length > 500 ? key.slice(0, 500) : key
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function filesCommand(ctx: BotCtx, param: string): Promise<void> {
  const folder = param.trim() ? param.trim().replace(/^\/+|\/+$/g, '') + '/' : DEFAULT_ROOT
  await showFolder(ctx, folder)
}

async function showFolder(ctx: BotCtx, folder: string, query?: TelegramCallbackQuery): Promise<void> {
  const { kit } = ctx
  const chatId = query?.from.id || ctx.chatId
  const fm = new FileManagerService(kit.bucket)
  const { files, folders } = await fm.list(folder)

  const label = folder === DEFAULT_ROOT ? '📁 File Manager' : `📁 <code>${escapeHtml(folder)}</code>`
  const text = [
    label,
    '',
    ...(files.length === 0 && folders.length === 0
      ? ['Folder kosong.']
      : [
          ...folders.map((f) => `📁 <b>${escapeHtml(f.name)}</b>/`),
          ...files.map((f) => `${fileIcon(f)} ${escapeHtml(f.name)} — <code>${formatBytes(f.size)}</code>`),
        ]),
  ].join('\n')

  const rows: TelegramCallbackButton[][] = folders.slice(0, 8).map((f) => [
    { text: `📁 ${f.name}/`, callback_data: `file_open:${safeKey(f.key)}` },
  ])
  for (const f of files.slice(0, 6)) {
    rows.push([{ text: `⬇️ ${f.name}`, callback_data: `file_dl:${safeKey(f.key)}` }])
  }
  const nav: TelegramCallbackButton[] = []
  if (folder !== DEFAULT_ROOT && folder !== '') {
    nav.push({ text: '⬆️ Up', callback_data: `file_open:${parentFolder(folder)}` })
  }
  nav.push({ text: '🏠 Root', callback_data: 'files' })
  nav.push({ text: '🕹 Menu', callback_data: 'menu' })
  rows.push(nav)

  if (query?.message) {
    await kit.editMessage(chatId, query.message.message_id, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  } else {
    await kit.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: inlineKeyboard(rows) })
  }
}

function parentFolder(folder: string): string {
  const trimmed = folder.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx === -1) return DEFAULT_ROOT
  return trimmed.slice(0, idx + 1)
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

async function fileOpen(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const folder = (parts[0] || DEFAULT_ROOT).replace(/\/+$/, '') + '/'
  await showFolder(ctx, folder, query)
}

async function fileDl(ctx: BotCtx, query: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const { kit } = ctx
  const key = parts[0] || ''
  if (!kit.env.DOWNLOAD_TOKEN_SECRET) {
    await kit.sendMessage(query.from.id, '❌ DOWNLOAD_TOKEN_SECRET belum dikonfigurasi.')
    return
  }
  const fm = new FileManagerService(kit.bucket)
  const obj = await fm.head(key)
  if (!obj) {
    await kit.sendMessage(query.from.id, `❌ File <code>${escapeHtml(key)}</code> tidak ditemukan.`, { parse_mode: 'HTML' })
    return
  }

  const jti = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = await signHs256(
    {
      sub: 'admin-telegram',
      kind: 'file-download',
      key,
      jti,
      iss: 'api.chatloka.net',
      exp,
    },
    kit.env.DOWNLOAD_TOKEN_SECRET,
  )

  const baseUrl = kit.env.API_BASE_URL || 'https://api.chatloka.net'
  const downloadUrl = `${baseUrl}/api/files/download/${token}`

  await kit.sendMessage(
    query.from.id,
    [
      `⬇️ <b>${escapeHtml(obj.key)}</b>`,
      '',
      `🔗 <code>${escapeHtml(downloadUrl)}</code>`,
      '',
      '⚠️ Single-use + 1 jam. Bisa dibuka langsung di browser.',
    ].join('\n'),
    {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard([[{ text: '↩️ Folder', callback_data: `file_open:${safeKey(parentFolder(key))}` }]]),
    },
  )
  await kit.logAction({ action: 'file_download_link', chat_id: query.from.id, target: key, message: obj.key })
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export const filesTool: TelegramTool = {
  commands: {
    '/files': filesCommand,
  },
  callbacks: {
    files: (ctx, query) => showFolder(ctx, DEFAULT_ROOT, query),
    file_open: fileOpen,
    file_dl: fileDl,
  },
  menuCommands: [
    { cmd: '/files [path]', desc: 'browse File Manager R2' },
  ],
  menuButtons: [
    [{ text: '📁 Files', callback_data: 'files' }],
  ],
}
