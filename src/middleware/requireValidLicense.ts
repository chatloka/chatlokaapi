import type { MiddlewareHandler } from 'hono'
import { LicenseService } from '../services/license'
import type { CloudflareBindings, License } from '../types'

export type LicenseContextVariables = {
  license: License
  purchaseCode: string
}

export const requireValidLicense: MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: LicenseContextVariables }> = async (c, next) => {
  const purchaseCode = c.req.header('x-license-key')
  if (!purchaseCode) {
    return c.json({ error: 'missing_license', message: 'Header X-License-Key is required' }, 401)
  }

  const licenseService = new LicenseService(c.env.DB)
  const license = await licenseService.getActiveLicenseByPurchaseCode(purchaseCode)

  if (!license) {
    return c.json({ error: 'license_invalid', message: 'License not found or inactive' }, 401)
  }

  c.set('license', license as License)
  c.set('purchaseCode', purchaseCode)
  await next()
}
