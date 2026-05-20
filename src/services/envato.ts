import type { CloudflareBindings, EnvatoPurchase, EnvatoVerificationResponse, LicenseType } from '../types'

export class EnvatoService {
  private token: string
  private apiUrl = 'https://api.envato.com/v3/market'

  constructor(env: CloudflareBindings) {
    this.token = env.ENVATO_PERSONAL_TOKEN
  }

  async verifyPurchaseCode(purchaseCode: string): Promise<EnvatoVerificationResponse> {
    if (this.isTestPurchaseCode(purchaseCode)) return this.getMockPurchaseData(purchaseCode)

    try {
      const response = await fetch(`${this.apiUrl}/author/sale?code=${purchaseCode}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'ChatLoka License Worker',
        },
      })

      if (!response.ok) {
        if (response.status === 404) return { valid: false, error: 'Invalid purchase code' }
        return { valid: false, error: `Envato API error: ${response.status}` }
      }

      const data = await response.json<any>()
      const purchase: EnvatoPurchase = {
        sold_at: data.sold_at,
        license: this.mapEnvatoLicense(data.license),
        supported_until: data.supported_until,
        buyer: data.buyer,
        purchase_count: data.purchase_count || 1,
        item: { id: data.item.id, name: data.item.name },
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
