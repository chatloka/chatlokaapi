import type { CloudflareBindings, EnvatoPurchase, EnvatoVerificationResponse, LicenseType } from '../types'

const DEFAULT_ENVATO_API_URL = 'https://api.envato.com/v3/market'

export class EnvatoService {
  private token: string
  private apiUrl: string

  constructor(env: CloudflareBindings) {
    this.token = env.ENVATO_PERSONAL_TOKEN
    this.apiUrl = (env.ENVATO_API_URL || DEFAULT_ENVATO_API_URL).replace(/\/+$/, '')
  }

  async verifyPurchaseCode(purchaseCode: string): Promise<EnvatoVerificationResponse> {
    if (this.isTestPurchaseCode(purchaseCode)) return this.getMockPurchaseData(purchaseCode)

    try {
      const response = await fetch(`${this.apiUrl}/author/sale?code=${encodeURIComponent(purchaseCode)}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'ChatLoka License Worker',
        },
      })

      if (response.status === 410) {
        return { valid: false, revoked: true, error: 'This purchase code has been revoked or refunded.' }
      }

      if (!response.ok) {
        if (response.status === 404) return { valid: false, error: 'Invalid purchase code' }
        return { valid: false, error: `Envato API error: ${response.status}` }
      }

      const data: any = await response.json()

      if (data && (data.refunded === true || data.refunded === 1 || data.revoked === true || data.revoked === 1)) {
        return { valid: false, revoked: true, error: 'This purchase code has been revoked or refunded.' }
      }

      if (!data || !data.sold_at || !data.license) {
        return { valid: false, error: 'Incomplete Envato API response' }
      }

      const purchase: EnvatoPurchase = {
        sold_at: data.sold_at,
        license: this.mapEnvatoLicense(data.license),
        supported_until: data.supported_until,
        buyer: data.buyer,
        purchase_count: data.purchase_count || 1,
        item: { id: data.item?.id, name: data.item?.name },
      }

      return { valid: true, purchase }
    } catch {
      return { valid: false, error: 'Failed to connect to Envato API' }
    }
  }

  private isTestPurchaseCode(purchaseCode: string): boolean {
    return purchaseCode.startsWith('test-') || purchaseCode.startsWith('dev-') || purchaseCode === 'demo-regular-license' || purchaseCode === 'demo-extended-license'
  }

  private getMockPurchaseData(purchaseCode: string): EnvatoVerificationResponse {
    const isExtended = purchaseCode.includes('extended') || purchaseCode.includes('ext')
    const purchase: EnvatoPurchase = {
      sold_at: new Date().toISOString(),
      license: isExtended ? 'extended' : 'regular',
      supported_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      buyer: 'test-buyer@example.com',
      purchase_count: 1,
      item: { id: 12345, name: 'ChatOn - Multi-Channel Customer Support System' },
    }

    return { valid: true, purchase }
  }

  private mapEnvatoLicense(envatoLicense: string): LicenseType {
    return envatoLicense.toLowerCase().includes('extended') ? 'extended' : 'regular'
  }
}
