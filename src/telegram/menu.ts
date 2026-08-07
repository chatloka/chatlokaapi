import { inlineKeyboard, type TelegramCallbackButton } from './botApi'
import type { TelegramTool } from './types'

/** /start menu text — composed from every tool's menuCommands. */
export function buildMainMenuText(tools: TelegramTool[]): string {
  const lines: string[] = ['<b>🎛️ Chatloka Bot</b> — kontrol license, plugin & support', '']

  const commandList = tools.flatMap((t) => t.menuCommands || [])
  if (commandList.length > 0) {
    lines.push('Command yang tersedia:')
    for (const { cmd, desc } of commandList) {
      lines.push(`  • <code>${cmd}</code> — ${desc}`)
    }
    lines.push('')
  }

  lines.push('Semua aksi juga bisa lewat tombol di bawah.')
  return lines.join('\n')
}

/** Main menu keyboard — composed from every tool's menuButtons. */
export function defaultMenuMarkup(tools: TelegramTool[]): Record<string, unknown> {
  const rows: TelegramCallbackButton[][] = []
  for (const t of tools) {
    for (const row of t.menuButtons || []) {
      rows.push(row)
    }
  }
  rows.push([{ text: '🕹 Main menu', callback_data: 'menu' }])
  return inlineKeyboard(rows)
}
