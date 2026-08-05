import type { EnvatoPurchase, License, LicenseType, ValidationType } from '../types'
import { all, first, run } from './d1'

type ChecksumRow = { file_path: string; checksum_md5: string }

export class LicenseService {
  constructor(private db: D1Database) {}

  async createLicense(data: {
    purchase_code: string
    license_type: LicenseType
    domain: string
    buyer_email?: string
    buyer_name?: string
    item_id?: string
    item_name?: string
    purchase_date?: string
    support_until?: string
  }): Promise<License> {
    const now = new Date().toISOString()
    await run(
      this.db,
      `INSERT INTO licenses (purchase_code, license_type, domain, buyer_email, buyer_name, item_id, item_name, purchase_date, support_until, activated_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      data.purchase_code,
      data.license_type,
      data.domain,
      data.buyer_email || null,
      data.buyer_name || null,
      data.item_id || null,
      data.item_name || null,
      data.purchase_date || null,
      data.support_until || null,
      now,
      now,
      now,
    )

    const created = await this.getLicenseByPurchaseCode(data.purchase_code)
    if (!created) throw new Error('Failed to create license')
    return created
  }

  async getLicenseByPurchaseCode(purchaseCode: string): Promise<License | null> {
    return first<License>(this.db, 'SELECT * FROM licenses WHERE purchase_code = ? LIMIT 1', purchaseCode)
  }

  async getActiveLicenseByPurchaseCode(purchaseCode: string): Promise<License | null> {
    return first<License>(this.db, "SELECT * FROM licenses WHERE purchase_code = ? AND status = 'active' LIMIT 1", purchaseCode)
  }

  async updateLastValidation(licenseId: number): Promise<void> {
    await run(this.db, 'UPDATE licenses SET last_validated_at = ?, updated_at = ? WHERE id = ?', new Date().toISOString(), new Date().toISOString(), licenseId)
  }

  async reactivateLicense(licenseId: number, domain: string): Promise<void> {
    const now = new Date().toISOString()
    await run(this.db, "UPDATE licenses SET domain = ?, status = 'active', activated_at = ?, updated_at = ? WHERE id = ?", domain, now, now, licenseId)
  }

  async upsertDeactivatedLicense(purchaseCode: string, envato: EnvatoPurchase): Promise<License> {
    const now = new Date().toISOString()
    await run(
      this.db,
      `INSERT INTO licenses (purchase_code, license_type, domain, buyer_email, buyer_name, item_id, item_name, purchase_date, support_until, activated_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'deactivated', ?, ?)
       ON CONFLICT(purchase_code) DO NOTHING`,
      purchaseCode,
      envato.license,
      '__pending_activation__',
      envato.buyer || null,
      null,
      envato.item?.id?.toString() || null,
      envato.item?.name || null,
      envato.sold_at || null,
      envato.supported_until || null,
      now,
      now,
      now,
    )
    const row = await this.getLicenseByPurchaseCode(purchaseCode)
    if (!row) throw new Error('Failed to upsert deactivated license')
    return row
  }

  async deactivateLicense(purchaseCode: string, domain: string): Promise<boolean> {
    const license = await this.getLicenseByPurchaseCode(purchaseCode)
    if (!license || license.domain !== domain) return false

    await run(this.db, "UPDATE licenses SET status = 'deactivated', updated_at = ? WHERE id = ?", new Date().toISOString(), license.id)
    return true
  }

  async logValidation(data: {
    license_id: number
    domain: string
    validation_type: ValidationType
    success: boolean
    error_message?: string
    ip_address?: string
    user_agent?: string
  }): Promise<void> {
    await run(
      this.db,
      'INSERT INTO validation_logs (license_id, domain, ip_address, user_agent, validation_type, success, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
      data.license_id,
      data.domain,
      data.ip_address || null,
      data.user_agent || null,
      data.validation_type,
      data.success ? 1 : 0,
      data.error_message || null,
    )
  }

  async getReleaseChecksums(version: string): Promise<Record<string, string>> {
    const rows = await all<ChecksumRow>(this.db, 'SELECT file_path, checksum_md5 FROM release_checksums WHERE version = ?', version)
    const result: Record<string, string> = {}
    for (const row of rows) result[row.file_path] = row.checksum_md5
    return result
  }

  async logTamperAttempt(data: { license_id: number; domain: string; failures: string[]; ip?: string }): Promise<void> {
    await run(
      this.db,
      'INSERT INTO tamper_logs (license_id, domain, failures, ip) VALUES (?, ?, ?, ?)',
      data.license_id,
      data.domain,
      JSON.stringify(data.failures),
      data.ip || null,
    )
  }

  async countRecentTamperAttempts(licenseId: number, hours: number): Promise<number> {
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    const row = await first<{ count: number }>(
      this.db,
      'SELECT COUNT(*) as count FROM tamper_logs WHERE license_id = ? AND created_at >= ?',
      licenseId,
      sinceIso,
    )
    return Number(row?.count || 0)
  }

  getFeatures(licenseType: LicenseType): Record<string, boolean> {
    const isExtended = licenseType === 'extended'
    return {
      organizations: isExtended,
      subscription_plans: isExtended,
      subscription_orders: isExtended,
      billing: isExtended,
      payment_confirmations: isExtended,
      credit_topups: isExtended,
      payment_gateway: isExtended,
      credit_system: isExtended,
      bank_accounts: isExtended,
      platform_webhooks: isExtended,
      platform_api: isExtended,
      plugins: true,
      api_docs: true,
      saas: isExtended,
    }
  }

  async cacheEnvatoResponse(purchaseCode: string, responseData: unknown, ttlHours = 24): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
    await run(
      this.db,
      `INSERT INTO envato_cache (purchase_code, response_data, cached_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(purchase_code) DO UPDATE SET response_data = excluded.response_data, cached_at = excluded.cached_at, expires_at = excluded.expires_at`,
      purchaseCode,
      JSON.stringify(responseData),
      new Date().toISOString(),
      expiresAt,
    )
  }

  async getCachedEnvatoResponse(purchaseCode: string): Promise<any | null> {
    const row = await first<{ response_data: string }>(
      this.db,
      'SELECT response_data FROM envato_cache WHERE purchase_code = ? AND expires_at > ? LIMIT 1',
      purchaseCode,
      new Date().toISOString(),
    )
    if (!row) return null
    return JSON.parse(row.response_data)
  }
}
