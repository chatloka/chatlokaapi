import { first, run } from './d1'

export interface AppVersion {
  id: number
  version: string
  changelog: string | null
  zip_path: string
  checksum: string
  file_size: number | null
  min_php_version: string | null
  min_chatloka_version: string | null
  breaking_changes: string | null
  released_at: string | null
  is_latest: number
  created_at: string | null
  created_by: string | null
}

export class AppUpdateService {
  constructor(private db: D1Database) {}

  async getLatestVersion(): Promise<AppVersion | null> {
    return first<AppVersion>(this.db, 'SELECT * FROM app_versions WHERE is_latest = 1 LIMIT 1')
  }

  async getVersionByVersion(version: string): Promise<AppVersion | null> {
    return first<AppVersion>(this.db, 'SELECT * FROM app_versions WHERE version = ? LIMIT 1', version)
  }

  async getAllVersions(): Promise<AppVersion[]> {
    const result = await this.db.prepare('SELECT * FROM app_versions ORDER BY released_at DESC').all()
    return (result.results || []) as unknown as AppVersion[]
  }

  async getVersionsPaginated(page: number, limit: number, search?: string): Promise<{ versions: AppVersion[]; total: number }> {
    let query = 'SELECT * FROM app_versions WHERE 1=1'
    let countQuery = 'SELECT COUNT(*) as total FROM app_versions WHERE 1=1'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (search) {
      const searchClause = ' AND (version LIKE ? OR changelog LIKE ?)'
      query += searchClause
      countQuery += searchClause
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam)
      countParams.push(searchParam, searchParam)
    }

    const orderClause = ' ORDER BY released_at DESC LIMIT ? OFFSET ?'
    query += orderClause
    params.push(limit, (page - 1) * limit)

    const [versionsResult, countResult] = await this.db.batch([
      this.db.prepare(query).bind(...params),
      this.db.prepare(countQuery).bind(...countParams),
    ])

    const total = (countResult.results?.[0] as { total: number })?.total || 0
    return { versions: (versionsResult.results || []) as unknown as AppVersion[], total }
  }

  async createVersion(data: {
    version: string
    changelog?: string
    zip_path: string
    checksum: string
    file_size?: number
    min_php_version?: string
    min_chatloka_version?: string
    breaking_changes?: string
    created_by?: string
  }): Promise<void> {
    // Mark all previous versions as not latest
    await run(this.db, 'UPDATE app_versions SET is_latest = 0')

    // Insert new version
    await run(
      this.db,
      `INSERT INTO app_versions (version, changelog, zip_path, checksum, file_size, min_php_version, min_chatloka_version, breaking_changes, is_latest, released_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)`,
      data.version,
      data.changelog || null,
      data.zip_path,
      data.checksum,
      data.file_size || null,
      data.min_php_version || '8.2',
      data.min_chatloka_version || null,
      data.breaking_changes || null,
      data.created_by || null,
    )
  }

  async deleteVersion(version: string): Promise<boolean> {
    // Cannot delete the latest version
    const latest = await this.getLatestVersion()
    if (latest && latest.version === version) {
      return false
    }

    await run(this.db, 'DELETE FROM app_versions WHERE version = ?', version)
    return true
  }

  async isTokenUsed(jti: string): Promise<boolean> {
    const row = await first<{ jti: string }>(this.db, 'SELECT jti FROM app_used_tokens WHERE jti = ? LIMIT 1', jti)
    return row !== null
  }

  async markTokenAsUsed(jti: string, expiresAt: Date): Promise<void> {
    await run(this.db, 'INSERT INTO app_used_tokens (jti, expires_at) VALUES (?, ?)', jti, expiresAt.toISOString())
  }

  async logUpdate(data: {
    purchase_code: string
    domain: string
    from_version: string
    to_version: string
    status: string
    error_message?: string
    ip_address?: string
    user_agent?: string
  }): Promise<void> {
    await run(
      this.db,
      `INSERT INTO app_update_logs (purchase_code, domain, from_version, to_version, status, error_message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      data.purchase_code,
      data.domain,
      data.from_version,
      data.to_version,
      data.status,
      data.error_message || null,
      data.ip_address || null,
      data.user_agent || null,
    )
  }

  async getUpdateLogs(page: number, limit: number, search?: string): Promise<{ logs: unknown[]; total: number }> {
    let query = 'SELECT * FROM app_update_logs WHERE 1=1'
    let countQuery = 'SELECT COUNT(*) as total FROM app_update_logs WHERE 1=1'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (search) {
      const searchClause = ' AND (purchase_code LIKE ? OR domain LIKE ?)'
      query += searchClause
      countQuery += searchClause
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam)
      countParams.push(searchParam, searchParam)
    }

    query += ' ORDER BY downloaded_at DESC LIMIT ? OFFSET ?'
    params.push(limit, (page - 1) * limit)

    const [logsResult, countResult] = await this.db.batch([
      this.db.prepare(query).bind(...params),
      this.db.prepare(countQuery).bind(...countParams),
    ])

    const total = (countResult.results?.[0] as { total: number })?.total || 0
    return { logs: logsResult.results || [], total }
  }

  getDownloadUrl(version: string): string {
    const baseUrl = 'https://api.chatloka.net'
    return `${baseUrl}/downloads/chatloka-${version}.zip`
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
