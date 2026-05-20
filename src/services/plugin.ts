import type { PluginInput, PluginVersion, PluginVersionInfo } from '../types'
import { first, run } from './d1'

export class PluginService {
  constructor(
    private db: D1Database,
    private baseUrl: string,
  ) {}

  async getLatestVersion(slug: string): Promise<PluginVersion | null> {
    return first<PluginVersion>(this.db, 'SELECT * FROM plugin_versions WHERE slug = ? AND is_latest = 1 LIMIT 1', slug)
  }

  async getPluginBySlugAndVersion(slug: string, version: string): Promise<PluginVersion | null> {
    return first<PluginVersion>(this.db, 'SELECT * FROM plugin_versions WHERE slug = ? AND version = ? LIMIT 1', slug, version)
  }

  async checkUpdates(plugins: PluginInput[]): Promise<Record<string, PluginVersionInfo>> {
    const result: Record<string, PluginVersionInfo> = {}

    for (const { slug, version } of plugins) {
      const latest = await this.getLatestVersion(slug)
      if (!latest) {
        result[slug] = { has_update: false, version, changelog: null, download_url: null, checksum: null }
        continue
      }

      const hasUpdate = this.compareVersions(latest.version, version) > 0
      result[slug] = {
        has_update: hasUpdate,
        version: latest.version,
        changelog: hasUpdate ? latest.changelog : null,
        download_url: hasUpdate ? this.getDownloadUrl(slug, latest.version) : null,
        checksum: hasUpdate ? latest.checksum : null,
      }
    }

    return result
  }

  getDownloadUrl(slug: string, version: string): string {
    return `${this.baseUrl}/downloads/${slug}-${version}.zip`
  }

  async logDownload(data: { purchase_code: string; slug: string; version: string; domain: string; ip_address?: string }): Promise<void> {
    await run(
      this.db,
      'INSERT INTO download_logs (purchase_code, slug, version, domain, ip_address) VALUES (?, ?, ?, ?, ?)',
      data.purchase_code,
      data.slug,
      data.version,
      data.domain,
      data.ip_address || null,
    )
  }

  async markTokenAsUsed(jti: string, expiresAt: Date): Promise<void> {
    await run(this.db, 'INSERT INTO used_tokens (jti, expires_at) VALUES (?, ?)', jti, expiresAt.toISOString())
  }

  async isTokenUsed(jti: string): Promise<boolean> {
    const row = await first<{ jti: string }>(this.db, 'SELECT jti FROM used_tokens WHERE jti = ? LIMIT 1', jti)
    return row !== null
  }

  compareVersions(a: string, b: string): number {
    const parseVersion = (v: string): number[] => v.replace(/[^0-9.]/g, '').split('.').map((n) => parseInt(n, 10) || 0)
    const partsA = parseVersion(a)
    const partsB = parseVersion(b)
    const maxLen = Math.max(partsA.length, partsB.length)

    for (let i = 0; i < maxLen; i++) {
      const numA = partsA[i] ?? 0
      const numB = partsB[i] ?? 0
      if (numA !== numB) return numA - numB
    }

    return 0
  }
}
