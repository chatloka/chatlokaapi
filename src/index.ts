import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { LicenseService } from './services/license'
import { EnvatoService } from './services/envato'
import { SignatureService } from './services/signature'
import { PluginService } from './services/plugin'
import { AppUpdateService } from './services/appUpdate'
import { ResendService } from './services/resend'
import { TicketService } from './services/ticket'
import type { Ticket } from './services/ticket'
import { NotificationService } from './services/notification'
import { requireValidLicense, type LicenseContextVariables } from './middleware/requireValidLicense'
import { getClientIp } from './http'
import { signHs256, verifyHs256 } from './services/jwt'
import { createAuth } from './auth'
import { adminRoutes } from './admin'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createMcpServer } from './mcp'
import { getMigrations } from 'better-auth/db/migration'
import type {
  ActivateRequest,
  CheckUpdatesRequest,
  CloudflareBindings,
  DeactivateRequest,
  DownloadTokenRequest,
  ValidateRequest,
  VerifyRequest,
} from './types'
import type { Context } from 'hono'

// Durable Object classes must be exported from the worker entrypoint.
export { RealtimeHub } from './realtime/hub'
import { broadcastRealtime } from './realtime/hub'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: LicenseContextVariables }>()

// API Logging middleware for all public endpoints
app.use('/api/*', async (c, next) => {
  const startTime = Date.now()
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  const userAgent = c.req.header('user-agent') || ''
  const method = c.req.method
  const endpoint = new URL(c.req.url).pathname

  // Try to extract purchase_code and domain from body
  let purchaseCode: string | null = null
  let domain: string | null = null
  let requestBodySize: number | null = null

  if (method === 'POST' || method === 'PUT') {
    try {
      const cloned = c.req.raw.clone()
      const body = await cloned.json() as Record<string, unknown>
      purchaseCode = (body.purchase_code as string) || null
      domain = (body.domain as string) || null
      requestBodySize = JSON.stringify(body).length
    } catch {
      // Body might not be JSON, that's fine
    }
  }

  let statusCode = 500

  try {
    await next()
    statusCode = c.res.status
  } catch (error) {
    statusCode = 500
    throw error
  } finally {
    const responseTimeMs = Date.now() - startTime

    try {
      await c.env.DB.prepare(
        `INSERT INTO api_logs (method, endpoint, ip_address, user_agent, purchase_code, domain, status_code, response_time_ms, request_size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(method, endpoint, ip, userAgent, purchaseCode, domain, statusCode, responseTimeMs, requestBodySize)
        .run()
    } catch (e) {
      console.error('[API Log] Failed to write log:', e)
    }
  }
})

async function enforceRateLimit(c: Context, limiter: RateLimit, scope: string) {
  const ip = c.req.header('cf-connecting-ip') || 'unknown-ip'
  const apiKey = c.req.header('x-license-key') || 'anon'
  const key = `${scope}:${apiKey}:${ip}`
  const { success } = await limiter.limit({ key })
  if (!success) {
    return c.json(
      {
        success: false,
        message: 'Too many requests',
        error_code: 'RATE_LIMITED',
      },
      429,
    )
  }
  return null
}

async function enforceRateLimitByPurchaseCode(c: Context, limiter: RateLimit, scope: string, purchaseCode: string) {
  const ip = c.req.header('cf-connecting-ip') || 'unknown-ip'
  const safeKey = (purchaseCode || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_')
  const key = `${scope}:${safeKey}:${ip}`
  const { success } = await limiter.limit({ key })
  if (!success) {
    return c.json(
      {
        success: false,
        message: 'Too many requests',
        error_code: 'RATE_LIMITED',
      },
      429,
    )
  }
  return null
}

function maskDomain(domain: string): string {
  if (!domain) return ''
  const parts = domain.split('.')
  if (parts.length < 2) return domain
  const tld = parts[parts.length - 1]
  const sld = parts[parts.length - 2]
  if (sld.length <= 2) return `**.**.${tld}`
  const visible = sld.slice(0, 2)
  const masked = '*'.repeat(Math.max(sld.length - 2, 1))
  const head = parts.length > 2 ? `${parts.slice(0, -2).join('.')}.` : ''
  return `${head}${visible}${masked}.${tld}`
}

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-License-Key', 'X-Download-Token', 'X-ChatOn-Version'],
}))

app.get('/', (c) => {
  return c.json({
    status: 'API Operational',
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/activate', async (c) => {
  try {
    const limited = await enforceRateLimit(c, c.env.RL_ACTIVATE, 'activate')
    if (limited) return limited

    const body = await c.req.json<ActivateRequest>()
    const { purchase_code, domain } = body

    if (!purchase_code || !domain) return c.json({ success: false, message: 'Purchase code and domain are required' }, 400)

    const db = c.env.DB
    const licenseService = new LicenseService(db)
    const envatoService = new EnvatoService(c.env)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const existingLicense = await licenseService.getLicenseByPurchaseCode(purchase_code)
    if (existingLicense) {
      if (existingLicense.status === 'deactivated') {
        await licenseService.reactivateLicense(existingLicense.id, domain)
        await licenseService.logValidation({
          license_id: existingLicense.id,
          domain,
          validation_type: 'activate',
          success: true,
          ip_address: getClientIp(c),
          user_agent: c.req.header('user-agent'),
        })

        const responseData = {
          success: true,
          message: 'License activated successfully',
          license_type: existingLicense.license_type,
          features: licenseService.getFeatures(existingLicense.license_type),
          activated_at: new Date().toISOString(),
        }
        return c.json(await signatureService.createSignedResponse(responseData))
      }

      if (existingLicense.domain === domain) {
        const responseData = {
          success: true,
          message: 'License is already activated on this domain',
          license_type: existingLicense.license_type,
          features: licenseService.getFeatures(existingLicense.license_type),
          activated_at: existingLicense.activated_at,
        }
        return c.json(await signatureService.createSignedResponse(responseData), 409)
      }

      return c.json({ success: false, message: 'This purchase code is already activated on another domain' }, 409)
    }

    let envatoData = await licenseService.getCachedEnvatoResponse(purchase_code)
    if (!envatoData) {
      const verification = await envatoService.verifyPurchaseCode(purchase_code)
      if (!verification.valid || !verification.purchase) {
        return c.json({ success: false, message: verification.error || 'Invalid purchase code' }, 400)
      }
      envatoData = verification.purchase
      await licenseService.cacheEnvatoResponse(purchase_code, envatoData, 24)
    }

    const license = await licenseService.createLicense({
      purchase_code,
      license_type: envatoData.license,
      domain,
      buyer_email: envatoData.buyer,
      item_id: envatoData.item?.id?.toString(),
      item_name: envatoData.item?.name,
      purchase_date: envatoData.sold_at,
      support_until: envatoData.supported_until,
    })

    await licenseService.logValidation({
      license_id: license.id,
      domain,
      validation_type: 'activate',
      success: true,
      ip_address: getClientIp(c),
      user_agent: c.req.header('user-agent'),
    })

    const responseData = {
      success: true,
      message: 'License activated successfully',
      license_type: license.license_type,
      features: licenseService.getFeatures(license.license_type),
      activated_at: license.activated_at,
    }

    return c.json(await signatureService.createSignedResponse(responseData))
  } catch {
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

app.post('/api/verify', async (c) => {
  try {
    let body: VerifyRequest
    try {
      body = await c.req.json<VerifyRequest>()
    } catch {
      return c.json({ success: false, message: 'Invalid JSON body', error_code: 'INVALID_REQUEST' }, 400)
    }

    const { purchase_code, domain } = body
    if (!purchase_code || !domain) {
      return c.json({ success: false, message: 'Purchase code and domain are required', error_code: 'INVALID_REQUEST' }, 400)
    }

    const limited = await enforceRateLimitByPurchaseCode(c, c.env.RL_VERIFY, 'verify', purchase_code)
    if (limited) return limited

    const db = c.env.DB
    const licenseService = new LicenseService(db)
    const envatoService = new EnvatoService(c.env)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const existingLicense = await licenseService.getLicenseByPurchaseCode(purchase_code)

    if (existingLicense && existingLicense.status === 'active' && existingLicense.domain && existingLicense.domain !== domain) {
      const responseData = {
        success: false,
        valid: false,
        purchase_code_valid: true,
        domain_available: false,
        already_activated_here: false,
        license_type: existingLicense.license_type,
        error_code: 'DOMAIN_IN_USE',
        bound_domain_masked: maskDomain(existingLicense.domain),
        message: 'This purchase code is already activated on another domain. Please deactivate it first.',
      }
      return c.json(await signatureService.createSignedResponse(responseData))
    }

    if (existingLicense && existingLicense.status === 'suspended') {
      const responseData = {
        success: false,
        valid: false,
        purchase_code_valid: true,
        domain_available: false,
        already_activated_here: false,
        license_type: existingLicense.license_type,
        error_code: 'LICENSE_REVOKED',
        message: 'This license has been suspended or revoked.',
      }
      return c.json(await signatureService.createSignedResponse(responseData))
    }

    let envatoData = await licenseService.getCachedEnvatoResponse(purchase_code)
    if (!envatoData) {
      const verification = await envatoService.verifyPurchaseCode(purchase_code)
      if (verification.revoked) {
        const responseData = {
          success: false,
          valid: false,
          purchase_code_valid: false,
          domain_available: false,
          already_activated_here: false,
          error_code: 'LICENSE_REVOKED',
          message: verification.error || 'This purchase code has been revoked or refunded.',
        }
        return c.json(await signatureService.createSignedResponse(responseData))
      }
      if (!verification.valid || !verification.purchase) {
        const responseData = {
          success: false,
          valid: false,
          purchase_code_valid: false,
          domain_available: false,
          already_activated_here: false,
          error_code: 'INVALID_PURCHASE_CODE',
          message: verification.error || 'Invalid purchase code',
        }
        return c.json(await signatureService.createSignedResponse(responseData))
      }
      envatoData = verification.purchase
      await licenseService.cacheEnvatoResponse(purchase_code, envatoData, 24)
    }

    if (!existingLicense || existingLicense.status === 'deactivated') {
      await licenseService.upsertDeactivatedLicense(purchase_code, envatoData)
    }

    const licenseType = (existingLicense?.license_type || envatoData.license) as 'regular' | 'extended'
    const alreadyActivatedHere = Boolean(
      existingLicense && existingLicense.status === 'active' && existingLicense.domain === domain,
    )

    const responseData = {
      success: true,
      valid: true,
      purchase_code_valid: true,
      domain_available: true,
      already_activated_here: alreadyActivatedHere,
      license_type: licenseType,
      message: alreadyActivatedHere
        ? 'License is already activated on this domain. Re-installation is allowed.'
        : 'License is valid and available for activation on this domain.',
    }
    return c.json(await signatureService.createSignedResponse(responseData))
  } catch {
    return c.json({ success: false, message: 'Internal server error', error_code: 'INTERNAL_ERROR' }, 500)
  }
})

app.post('/api/validate', async (c) => {
  try {
    const limited = await enforceRateLimit(c, c.env.RL_VALIDATE, 'validate')
    if (limited) return limited

    const body = await c.req.json<ValidateRequest>()
    const { purchase_code, domain, app_version, file_checksums } = body
    if (!purchase_code || !domain) return c.json({ success: false, message: 'Purchase code and domain are required' }, 400)
    if (app_version && (!file_checksums || typeof file_checksums !== 'object' || Array.isArray(file_checksums))) {
      return c.json({ success: false, message: 'file_checksums must be an object of path=>md5' }, 400)
    }
    if (file_checksums && !app_version) {
      return c.json({ success: false, message: 'app_version is required when file_checksums is provided' }, 400)
    }

    const db = c.env.DB
    const licenseService = new LicenseService(db)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)
    const license = await licenseService.getLicenseByPurchaseCode(purchase_code)

    if (!license) {
      return c.json({ success: false, message: 'License not found', error_code: 'LICENSE_NOT_FOUND' }, 404)
    }

    if (license.domain !== domain) {
      await licenseService.logValidation({
        license_id: license.id,
        domain,
        validation_type: 'validate',
        success: false,
        error_message: 'Domain mismatch',
        ip_address: getClientIp(c),
        user_agent: c.req.header('user-agent'),
      })
      return c.json({ success: false, message: 'License is activated for a different domain', error_code: 'DOMAIN_MISMATCH' }, 403)
    }

    if (license.status !== 'active') {
      await licenseService.logValidation({
        license_id: license.id,
        domain,
        validation_type: 'validate',
        success: false,
        error_message: `License status: ${license.status}`,
        ip_address: getClientIp(c),
        user_agent: c.req.header('user-agent'),
      })
      return c.json({ success: false, message: `License is ${license.status}`, error_code: 'LICENSE_INACTIVE' }, 403)
    }

    await licenseService.updateLastValidation(license.id)
    await licenseService.logValidation({
      license_id: license.id,
      domain,
      validation_type: 'validate',
      success: true,
      ip_address: getClientIp(c),
      user_agent: c.req.header('user-agent'),
    })

    let integrityValid = true
    let integrityFailures: string[] = []
    let integrityAction: 'warn' | 'suspend' = 'warn'

    if (app_version && file_checksums) {
      const masterChecksums = await licenseService.getReleaseChecksums(app_version)
      for (const [path, clientHash] of Object.entries(file_checksums)) {
        const serverHash = masterChecksums[path]
        if (serverHash && serverHash !== clientHash) {
          integrityFailures.push(path)
        }
      }

      integrityValid = integrityFailures.length === 0
      if (!integrityValid) {
        await licenseService.logTamperAttempt({
          license_id: license.id,
          domain,
          failures: integrityFailures,
          ip: getClientIp(c),
        })
        const recentTamperCount = await licenseService.countRecentTamperAttempts(license.id, 24)
        integrityAction = recentTamperCount >= 3 ? 'suspend' : 'warn'
      }
    }

    const responseData: Record<string, unknown> = {
      success: true,
      license_type: license.license_type,
      features: licenseService.getFeatures(license.license_type),
      integrity_valid: integrityValid,
      activated_at: license.activated_at,
    }

    if (!integrityValid) {
      responseData.integrity_failures = integrityFailures
      responseData.integrity_action = integrityAction
    }

    return c.json(await signatureService.createSignedResponse(responseData))
  } catch {
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

app.post('/api/deactivate', async (c) => {
  try {
    const limited = await enforceRateLimit(c, c.env.RL_DEACTIVATE, 'deactivate')
    if (limited) return limited

    const body = await c.req.json<DeactivateRequest>()
    const { purchase_code, domain } = body
    if (!purchase_code || !domain) return c.json({ success: false, message: 'Purchase code and domain are required' }, 400)

    const db = c.env.DB
    const licenseService = new LicenseService(db)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const license = await licenseService.getLicenseByPurchaseCode(purchase_code)
    if (!license) return c.json({ success: false, message: 'License not found' }, 404)
    if (license.domain !== domain) return c.json({ success: false, message: 'Domain mismatch' }, 403)

    await licenseService.deactivateLicense(purchase_code, domain)
    await licenseService.logValidation({
      license_id: license.id,
      domain,
      validation_type: 'deactivate',
      success: true,
      ip_address: getClientIp(c),
      user_agent: c.req.header('user-agent'),
    })

    return c.json(await signatureService.createSignedResponse({ success: true, message: 'License deactivated successfully' }))
  } catch {
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

app.get('/api/features/:licenseType', async (c) => {
  try {
    const licenseType = c.req.param('licenseType')
    if (!['regular', 'extended'].includes(licenseType)) return c.json({ success: false, message: 'Invalid license type' }, 400)

    const db = c.env.DB
    const licenseService = new LicenseService(db)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    return c.json(await signatureService.createSignedResponse({
      success: true,
      license_type: licenseType,
      features: licenseService.getFeatures(licenseType as 'regular' | 'extended'),
    }))
  } catch {
    return c.json({ success: false, message: 'Internal server error' }, 500)
  }
})

app.post('/api/plugins/check-updates', requireValidLicense, async (c) => {
  try {
    const body = await c.req.json<CheckUpdatesRequest>()
    const { plugins, domain } = body

    if (!plugins || !Array.isArray(plugins) || plugins.length === 0) {
      return c.json({ error: 'invalid_request', message: 'plugins array is required and must not be empty' }, 400)
    }
    if (!domain) return c.json({ error: 'invalid_request', message: 'domain is required' }, 400)
    for (const plugin of plugins) {
      if (!plugin.slug || !plugin.version) return c.json({ error: 'invalid_request', message: 'Each plugin must have slug and version fields' }, 400)
    }

    const db = c.env.DB
    const pluginService = new PluginService(db, c.env.API_BASE_URL || new URL(c.req.url).origin)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const pluginUpdates = await pluginService.checkUpdates(plugins)
    return c.json(await signatureService.createSignedResponse({ plugins: pluginUpdates }))
  } catch {
    return c.json({ error: 'server_error', message: 'Internal server error' }, 500)
  }
})

app.post('/api/plugins/download-token', requireValidLicense, async (c) => {
  try {
    const limited = await enforceRateLimit(c, c.env.RL_PLUGIN_TOKEN, 'plugin-token')
    if (limited) return limited

    const body = await c.req.json<DownloadTokenRequest>()
    const { slug, domain } = body

    if (!slug) return c.json({ error: 'invalid_request', message: 'slug is required' }, 400)
    if (!domain) return c.json({ error: 'invalid_request', message: 'domain is required' }, 400)

    const purchaseCode = c.get('purchaseCode')
    const db = c.env.DB
    const pluginService = new PluginService(db, c.env.API_BASE_URL || new URL(c.req.url).origin)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const latest = await pluginService.getLatestVersion(slug)
    if (!latest) return c.json({ error: 'plugin_not_found', message: `Plugin '${slug}' not found` }, 404)
    if (!latest.checksum) return c.json({ error: 'plugin_unavailable', message: `Plugin '${slug}' is not available for download (missing checksum)` }, 503)

    const jti = crypto.randomUUID()
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = await signHs256(
      {
        sub: purchaseCode,
        slug,
        version: latest.version,
        domain,
        jti,
        iss: 'api.chaton.pro',
        exp,
      },
      c.env.DOWNLOAD_TOKEN_SECRET,
    )

    const filename = `${slug}-${latest.version}.zip`
    const downloadUrl = pluginService.getDownloadUrl(slug, latest.version)

    return c.json(await signatureService.createSignedResponse({
      token,
      expires_at: new Date(exp * 1000).toISOString(),
      download_url: downloadUrl,
      checksum: latest.checksum,
      filename,
    }))
  } catch {
    return c.json({ error: 'server_error', message: 'Internal server error' }, 500)
  }
})

app.get('/downloads/:filename', async (c) => {
  const limited = await enforceRateLimit(c, c.env.RL_PLUGIN_DOWNLOAD, 'plugin-download')
  if (limited) return limited

  const filename = c.req.param('filename')
  const token = c.req.header('x-download-token')
  if (!token) return c.json({ error: 'token_missing', message: 'Header X-Download-Token is required' }, 401)

  let payload: Record<string, any>
  try {
    payload = await verifyHs256(token, c.env.DOWNLOAD_TOKEN_SECRET)
  } catch (e: any) {
    return c.json({ error: 'token_invalid', message: e?.message || 'Invalid or expired token' }, 401)
  }

  // Check issuer - support both plugin tokens and app update tokens
  const validIssuers = ['api.chaton.pro', 'api.chatloka.net']
  if (!validIssuers.includes(payload.iss)) return c.json({ error: 'token_invalid', message: 'Invalid token issuer' }, 401)

  const db = c.env.DB
  const isAppUpdate = payload.type === 'app-update'

  if (isAppUpdate) {
    // App update download flow
    const appUpdateService = new AppUpdateService(db)

    const alreadyUsed = await appUpdateService.isTokenUsed(payload.jti)
    if (alreadyUsed) return c.json({ error: 'token_already_used', message: 'This download token has already been used' }, 401)

    const expectedFilename = `chatloka-${payload.version}.zip`
    if (filename !== expectedFilename) return c.json({ error: 'filename_mismatch', message: 'Filename does not match the download token' }, 403)

    const appVersion = await appUpdateService.getVersionByVersion(payload.version)
    if (!appVersion) return c.json({ error: 'version_not_found', message: 'App version not found in database' }, 404)

    const object = await c.env.PLUGINS_BUCKET.get(appVersion.zip_path)
    if (!object || !object.body) return c.json({ error: 'file_not_found', message: `App file '${filename}' is not available on server` }, 404)

    await appUpdateService.markTokenAsUsed(payload.jti, new Date(payload.exp * 1000))

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Checksum-SHA256': appVersion.checksum,
        ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
      },
    })
  } else {
    // Plugin download flow (existing)
    const pluginService = new PluginService(db, c.env.API_BASE_URL || new URL(c.req.url).origin)

    const alreadyUsed = await pluginService.isTokenUsed(payload.jti)
    if (alreadyUsed) return c.json({ error: 'token_already_used', message: 'This download token has already been used' }, 401)

    const expectedFilename = `${payload.slug}-${payload.version}.zip`
    if (filename !== expectedFilename) return c.json({ error: 'filename_mismatch', message: 'Filename does not match the download token' }, 403)

    const pluginInfo = await pluginService.getPluginBySlugAndVersion(payload.slug, payload.version)
    if (!pluginInfo) return c.json({ error: 'plugin_not_found', message: 'Plugin version not found in database' }, 404)

    const object = await c.env.PLUGINS_BUCKET.get(pluginInfo.zip_path)
    if (!object || !object.body) return c.json({ error: 'file_not_found', message: `Plugin file '${filename}' is not available on server` }, 404)

    await pluginService.markTokenAsUsed(payload.jti, new Date(payload.exp * 1000))
    await pluginService.logDownload({
      purchase_code: payload.sub,
      slug: payload.slug,
      version: payload.version,
      domain: payload.domain,
      ip_address: getClientIp(c),
    })

    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Checksum-SHA256': pluginInfo.checksum,
        ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
      },
    })
  }
})

// ============================================
// App Update System (Public API)
// ============================================

// Check for application update
app.post('/api/app/check-update', requireValidLicense, async (c) => {
  try {
    const body = await c.req.json<{ current_version: string; domain: string }>()
    const { current_version, domain } = body

    if (!current_version) return c.json({ error: 'invalid_request', message: 'current_version is required' }, 400)
    if (!domain) return c.json({ error: 'invalid_request', message: 'domain is required' }, 400)

    const license = c.get('license')

    // Verify domain matches license
    if (license.domain !== domain) {
      return c.json({ error: 'domain_mismatch', message: 'Domain does not match license' }, 403)
    }

    const db = c.env.DB
    const appUpdateService = new AppUpdateService(db)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const latest = await appUpdateService.getLatestVersion()

    if (!latest) {
      return c.json(await signatureService.createSignedResponse({
        has_update: false,
        current_version,
        latest_version: current_version,
      }))
    }

    const hasUpdate = appUpdateService.compareVersions(latest.version, current_version) > 0

    const responseData: Record<string, unknown> = {
      has_update: hasUpdate,
      current_version,
      latest_version: latest.version,
    }

    if (hasUpdate) {
      responseData.changelog = latest.changelog
      responseData.download_url = appUpdateService.getDownloadUrl(latest.version)
      responseData.checksum = latest.checksum
      responseData.file_size = latest.file_size
      responseData.released_at = latest.released_at
      responseData.breaking_changes = latest.breaking_changes ? JSON.parse(latest.breaking_changes) : []
      responseData.min_php_version = latest.min_php_version
    }

    return c.json(await signatureService.createSignedResponse(responseData))
  } catch {
    return c.json({ error: 'server_error', message: 'Internal server error' }, 500)
  }
})

// Generate download token for app update
app.post('/api/app/download-token', requireValidLicense, async (c) => {
  try {
    const limited = await enforceRateLimit(c, c.env.RL_PLUGIN_TOKEN, 'app-download-token')
    if (limited) return limited

    const body = await c.req.json<{ version: string; domain: string }>()
    const { version, domain } = body

    if (!version) return c.json({ error: 'invalid_request', message: 'version is required' }, 400)
    if (!domain) return c.json({ error: 'invalid_request', message: 'domain is required' }, 400)

    const purchaseCode = c.get('purchaseCode')
    const license = c.get('license')

    // Verify domain matches license
    if (license.domain !== domain) {
      return c.json({ error: 'domain_mismatch', message: 'Domain does not match license' }, 403)
    }

    const db = c.env.DB
    const appUpdateService = new AppUpdateService(db)
    const signatureService = new SignatureService(c.env.RSA_PRIVATE_KEY)

    const appVersion = await appUpdateService.getVersionByVersion(version)
    if (!appVersion) return c.json({ error: 'version_not_found', message: `Version '${version}' not found` }, 404)
    if (!appVersion.checksum) return c.json({ error: 'version_unavailable', message: `Version '${version}' is not available for download` }, 503)

    const jti = crypto.randomUUID()
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = await signHs256(
      {
        sub: purchaseCode,
        type: 'app-update',
        version: appVersion.version,
        domain,
        jti,
        iss: 'api.chatloka.net',
        exp,
      },
      c.env.DOWNLOAD_TOKEN_SECRET,
    )

    const filename = `chatloka-${appVersion.version}.zip`
    const downloadUrl = appUpdateService.getDownloadUrl(appVersion.version)

    return c.json(await signatureService.createSignedResponse({
      token,
      expires_at: new Date(exp * 1000).toISOString(),
      download_url: downloadUrl,
      checksum: appVersion.checksum,
      filename,
      file_size: appVersion.file_size,
    }))
  } catch {
    return c.json({ error: 'server_error', message: 'Internal server error' }, 500)
  }
})

// Report update result
app.post('/api/app/update-result', requireValidLicense, async (c) => {
  try {
    const body = await c.req.json<{
      from_version: string
      to_version: string
      status: string
      domain: string
      error_message?: string
    }>()

    const { from_version, to_version, status, domain, error_message } = body

    if (!from_version || !to_version || !status || !domain) {
      return c.json({ error: 'invalid_request', message: 'from_version, to_version, status, and domain are required' }, 400)
    }

    if (!['success', 'failed', 'rollback'].includes(status)) {
      return c.json({ error: 'invalid_request', message: 'status must be success, failed, or rollback' }, 400)
    }

    const purchaseCode = c.get('purchaseCode')
    const db = c.env.DB
    const appUpdateService = new AppUpdateService(db)

    await appUpdateService.logUpdate({
      purchase_code: purchaseCode,
      domain,
      from_version,
      to_version,
      status,
      error_message: error_message || undefined,
      ip_address: getClientIp(c),
      user_agent: c.req.header('user-agent'),
    })

    return c.json({ success: true })
  } catch {
    return c.json({ error: 'server_error', message: 'Internal server error' }, 500)
  }
})

// ============================================
// Resend Webhook Handler (Ticket System)
// ============================================

/** Escape HTML so user-provided content (name, message preview) renders safely. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Strip HTML tags and collapse whitespace to produce a safe plain-text preview. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Extract a display name from an RFC 5322 From header.
 * Handles "Name <email>", "Name" <email>, <email> and bare email forms.
 * For bare addresses without a display name it returns null.
 */
function parseDisplayName(fromHeader: string | undefined | null): string | null {
  if (!fromHeader) return null
  const value = fromHeader.trim()
  if (!value) return null

  const match = value.match(/^(?:"([^"]*)"|([^<]*?))\s*<[^>]+>/)
  if (!match) return null
  const name = (match[1] || match[2] || '').trim()
  return name || null
}

/** Build a short, safe preview of the customer's message for the ack email. */
function buildMessagePreview(text: string | null, html: string | null, maxLength = 280): string {
  const plain = (text || stripHtml(html || '') || '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, maxLength) + (plain.length > maxLength ? '…' : '')
}

async function sendTicketAcknowledgement(
  env: CloudflareBindings,
  ticketService: TicketService,
  ticket: Ticket,
  customerEmail: string,
  customerName: string | null,
  originalSubject: string,
  messagePreview: string,
  resendService: ResendService,
  reopened = false,
): Promise<void> {
  const fromName = env.TICKET_FROM_NAME || 'Chatloka Support'
  const fromEmail = env.TICKET_FROM_EMAIL || 'contact@support.chatloka.net'
  const from = `${fromName} <${fromEmail}>`
  const ticketNumber = ticket.ticket_number

  const ackSubject = reopened
    ? `[${ticketNumber}] ${originalSubject} has been reopened`
    : `[${ticketNumber}] ${originalSubject} has been opened`

  const greetingHtml = customerName ? `Dear ${escapeHtml(customerName)},` : 'Dear valued customer,'
  const greetingText = customerName ? `Dear ${customerName},` : 'Dear valued customer,'
  const previewHtml = messagePreview
    ? escapeHtml(messagePreview).replace(/\n/g, '<br>')
    : ''

  const ackHtml = reopened
    ? `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;">
      <h2 style="margin:0 0 16px;font-size:20px;">Your ticket has been re-opened</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">${greetingHtml}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Thank you for reaching out again. Your support ticket has been successfully re-opened and is now being processed by our team.
      </p>
      <div style="margin:0 0 16px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Ticket ID</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:600;color:#111827;">${ticketNumber}</div>
      </div>
      ${previewHtml ? `
      <div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #93c5fd;background:#f9fafb;border-radius:0 8px 8px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-bottom:6px;">Your message</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#374151;">${previewHtml}</p>
      </div>` : ''}
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        A member of our support team will get in touch with you regarding this ticket shortly. No further action is required on your end at this time.
      </p>
      <div style="margin:0 0 16px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-size:13px;line-height:1.6;color:#374151;">
        <strong>To reply to this ticket</strong>&nbsp;— simply reply to this email. Your message will be added to <strong>${ticketNumber}</strong> automatically; no need to start a new email.
      </div>
      <p style="margin:0;font-size:14px;line-height:1.6;">Thank you for your patience and understanding.</p>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        Chatloka Support &middot; ${fromEmail}
      </div>
    </div>`
    : `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;">
      <h2 style="margin:0 0 16px;font-size:20px;">Your message has been received</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">${greetingHtml}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Thank you for contacting Chatloka Support. Your request has been received, and a support ticket has been created to track it.
      </p>
      <div style="margin:0 0 16px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Your ticket ID</div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:600;color:#111827;">${ticketNumber}</div>
      </div>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        Please keep this ticket ID for reference. When replying to this email, the ticket ID in the subject ensures your follow-ups are added to this ticket automatically.
      </p>
      ${previewHtml ? `
      <div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #93c5fd;background:#f9fafb;border-radius:0 8px 8px 0;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-bottom:6px;">Your message</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#374151;">${previewHtml}</p>
      </div>` : ''}
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
        A support representative will respond to your request as soon as possible. Thank you for your patience.
      </p>
      <div style="margin:0 0 16px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#f6fafb;font-size:13px;line-height:1.6;color:#374151;">
        <strong>How to reply to this ticket</strong>&nbsp;— simply reply to this email. Your message will be included in <strong>${ticketNumber}</strong> automatically; no new email is needed.
      </div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        Chatloka Support &middot; ${fromEmail}
      </div>
    </div>`

  const ackText = reopened
    ? `Your ticket has been re-opened.\n\n${greetingText}\n\nThank you for contacting Chatloka Support. Your support ticket ${ticketNumber} has been successfully reopened and is being processed by our team.\n\nTicket ID: ${ticketNumber}\n\nA member of our support team will reach out to you shortly. No further action is required on your end at this time.\n\nHow to reply: simply reply to this email — your message will be added to ${ticketNumber} automatically.\n\nThank you for your patience and understanding.\n\nChatloka Support`
    : `Your message has been received.\n\n${greetingText}\n\nThank you for contacting Chatloka Support. Your request has been received, and a support ticket has been created to track it.\n\nTicket ID: ${ticketNumber}\n\nPlease keep this ticket ID for reference.\n\nHow to reply: simply reply to this email — your message will be added to ${ticketNumber} automatically; no new email is needed.\n\nOur support team will respond to your request as soon as possible.\n\nChatloka Support`

  const result = await resendService.sendEmail({
    from,
    to: [customerEmail],
    subject: ackSubject,
    html: ackHtml,
    text: ackText,
  })

  // Real Message-ID so the customer's reply to the ack maps back to this ticket.
  let sentMessageId = result.id
  try {
    const sent = await resendService.getSentEmail(result.id)
    if (sent?.message_id) sentMessageId = sent.message_id
  } catch (sentErr) {
    console.error('[Ticket Ack] Failed to fetch sent Message-ID:', sentErr)
  }

  // Store the ack as an automated outbound message in the ticket thread.
  await ticketService.createMessage({
    ticket_id: ticket.id,
    direction: 'outbound',
    from_email: fromEmail,
    to_email: customerEmail,
    subject: ackSubject,
    body_html: ackHtml,
    body_text: ackText,
    resend_email_id: result.id,
    message_id: sentMessageId,
    is_automated: 1,
  })

  // Register it in the thread so the customer's reply (In-Reply-To = ack Message-ID) routes to this ticket.
  await ticketService.createEmailThread({
    ticket_id: ticket.id,
    message_id: sentMessageId,
    parent_message_id: null,
  })
}

app.post('/api/webhooks/resend', async (c) => {
  try {
    const payload = await c.req.text()
    const svixId = c.req.header('svix-id') || ''
    const svixTimestamp = c.req.header('svix-timestamp') || ''
    const svixSignature = c.req.header('svix-signature') || ''

    if (!svixId || !svixTimestamp || !svixSignature) {
      return c.json({ error: 'Missing webhook headers' }, 400)
    }

    const resendService = new ResendService(c.env)

    // Verify webhook signature
    const isValid = await resendService.verifyWebhook(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })

    if (!isValid) {
      console.error('[Resend Webhook] Invalid signature')
      return c.json({ error: 'Invalid signature' }, 401)
    }

    const event = JSON.parse(payload)

    // Only handle email.received events
    if (event.type !== 'email.received') {
      return c.json({ received: true })
    }

    // IMPORTANT: Resend routes this domain with catch-all, so emails to any
    // xxx@support.chatloka.net reach this webhook. Only process emails actually
    // addressed to the support inbox (To/Cc/Bcc/received_for); everything else
    // is acknowledged but ignored.
    const supportInbox = (c.env.TICKET_FROM_EMAIL || 'contact@support.chatloka.net').trim().toLowerCase()
    const eventRecipients = [
      ...(Array.isArray(event.data.to) ? event.data.to : []),
      ...(Array.isArray(event.data.cc) ? event.data.cc : []),
      ...(Array.isArray(event.data.bcc) ? event.data.bcc : []),
      ...(Array.isArray(event.data.received_for) ? event.data.received_for : []),
    ]
      .filter(Boolean)
      .map((e: string) => e.trim().toLowerCase())

    if (!eventRecipients.includes(supportInbox)) {
      console.error(`[Resend Webhook] Ignoring email not addressed to ${supportInbox}`)
      return c.json({ received: true })
    }

    const db = c.env.DB
    const ticketService = new TicketService(db)

    // Check if this is a reply (has In-Reply-To)
    // We need to fetch the full email to get headers
    const email = await resendService.getReceivedEmail(event.data.email_id)

    // Check for In-Reply-To header to find existing thread
    const inReplyTo = email.headers?.['in-reply-to'] || email.headers?.['In-Reply-To'] || null
    const references = email.headers?.references || email.headers?.['References'] || null

    // Recipients of this email (To/Cc/Bcc) become potential participants of the ticket.
    const recipientEmails: string[] = [
      ...(Array.isArray(event.data.to) ? event.data.to : []),
      ...(Array.isArray(event.data.cc) ? event.data.cc : []),
      ...(Array.isArray(event.data.bcc) ? event.data.bcc : []),
    ]
      .filter(Boolean)
      .map((e: string) => e.trim().toLowerCase())
    const senderEmail = (event.data.from || '').trim().toLowerCase()

    // Display name comes from the original From: header on the retrieve endpoint
    // (the webhook's data.from is the bare email address only).
    const senderName = parseDisplayName(email.headers?.from || email.headers?.['From'])

    // Plain-text preview of the customer's first message, used in the ack email.
    const messagePreview = buildMessagePreview(email.text || '', email.html || '')

    // An email is authorized to join a ticket if they are the ticket owner,
    // OR they have been a participant on the thread (was To/Cc/Bcc before).
    // This lets a CC'd sender reply (they're a participant) while blocking
    // strangers who merely copy a ticket number into their subject.
    const canAccessTicket = async (t: Ticket): Promise<boolean> =>
      t.from_email.trim().toLowerCase() === senderEmail ||
      (await ticketService.isParticipantOrOwner(t.id, senderEmail))

    let ticket = null
    let isNewTicket = false
    let wasReopened = false

    // 1. Match by In-Reply-To header (replies to an existing thread),
    //    then authorize the sender (owner or participant).
    if (inReplyTo) {
      ticket = await ticketService.findTicketByMessageId(inReplyTo)
      if (ticket && !(await canAccessTicket(ticket))) {
        ticket = null
      }
    }

    // 2. Match by ticket number embedded in subject/body (e.g. "TICKET-00001")
    if (!ticket) {
      const candidate = await ticketService.findTicketBySubject(
        event.data.subject || '',
        [email.text || '', email.html || ''],
      )
      if (candidate && (await canAccessTicket(candidate))) {
        ticket = candidate
        // If a closed/pending ticket is followed up, automatically re-open it
        if (ticket.status === 'closed' || ticket.status === 'pending') {
          await ticketService.reopenTicket(ticket.id)
          wasReopened = true
        }
      }
    }

    // 3. If the matched ticket has been merged, follow it to the primary ticket
    if (ticket && ticket.status === 'merged' && ticket.merged_into) {
      const primary = await ticketService.getTicketById(ticket.merged_into)
      if (primary) ticket = primary
    }

    // 4. Fallback: customer has an open ticket open — keep appending to it
    if (!ticket) {
      ticket = await ticketService.findOpenTicketBySender(event.data.from)
    }

    // Create new ticket if not found
    if (!ticket) {
      const ticketNumber = await ticketService.generateTicketNumber()
      ticket = await ticketService.createTicket({
        ticket_number: ticketNumber,
        from_email: event.data.from,
        from_name: senderName,
        subject: event.data.subject,
      })
      isNewTicket = true
    }

    // Register this email's participants (sender + To/Cc/Bcc recipients)
    // so they are authorized to reply to the thread later.
    await ticketService.addParticipants(ticket.id, recipientEmails)

    // Download attachments and upload to R2
    const bucket = c.env.PLUGINS_BUCKET
    const attachmentRecords: Array<{
      filename: string
      content_type: string
      file_size: number
      r2_path: string
      resend_attachment_id: string
      content_id: string | null
      content_disposition: string | null
    }> = []

    if (event.data.attachments && event.data.attachments.length > 0) {
      for (const att of event.data.attachments) {
        try {
          // Download attachment from Resend
          const downloadUrl = await resendService.getAttachmentDownloadUrl(event.data.email_id, att.id)
          const attResponse = await fetch(downloadUrl)
          if (attResponse.ok) {
            const attBuffer = await attResponse.arrayBuffer()
            const r2Path = `ticket-attachments/${ticket.ticket_number}/${event.data.email_id}/${att.filename}`

            // Upload to R2
            await bucket.put(r2Path, attBuffer, {
              httpMetadata: { contentType: att.content_type },
            })

            attachmentRecords.push({
              filename: att.filename,
              content_type: att.content_type,
              file_size: attBuffer.byteLength,
              r2_path: r2Path,
              resend_attachment_id: att.id,
              content_id: att.content_id || null,
              content_disposition: att.content_disposition || null,
            })
          }
        } catch (attError) {
          console.error(`[Resend Webhook] Failed to process attachment: ${att.filename}`, attError)
        }
      }
    }

    // Create message record
    const message = await ticketService.createMessage({
      ticket_id: ticket.id,
      direction: 'inbound',
      from_email: event.data.from,
      to_email: event.data.to[0],
      subject: event.data.subject,
      body_html: email.html,
      body_text: email.text,
      resend_email_id: event.data.email_id,
      message_id: event.data.message_id,
      in_reply_to: inReplyTo,
      references_header: references,
      has_attachments: attachmentRecords.length > 0 ? 1 : 0,
    })

    // Create attachment records
    for (const att of attachmentRecords) {
      await ticketService.createAttachment({
        ticket_message_id: message.id,
        ticket_id: ticket.id,
        filename: att.filename,
        content_type: att.content_type,
        file_size: att.file_size,
        r2_path: att.r2_path,
        resend_attachment_id: att.resend_attachment_id,
        content_id: att.content_id,
        content_disposition: att.content_disposition,
      })
    }

    // Create email thread record
    await ticketService.createEmailThread({
      ticket_id: ticket.id,
      message_id: event.data.message_id,
      parent_message_id: inReplyTo,
    })

    // Auto-acknowledgment emails sent to the customer:
    //  - New ticket: confirm the ticket has been opened
    //  - Reopened ticket: confirm the ticket has been re-opened and will be attended
    if (event.data.from && (isNewTicket || wasReopened)) {
      try {
        const nameForAck = ticket.from_name || senderName
        await sendTicketAcknowledgement(
          c.env,
          ticketService,
          ticket,
          event.data.from,
          nameForAck,
          event.data.subject || '',
          messagePreview,
          resendService,
          wasReopened,
        )
      } catch (ackErr) {
        console.error('[Resend Webhook] Failed to send ticket acknowledgment:', ackErr)
      }
    }

    const notifyType = wasReopened ? 'ticket_reopened' : (isNewTicket ? 'ticket_new' : 'message_inbound')

    // Broadcast realtime notification to admin clients
    const notificationService = new NotificationService(db)
    await notificationService.create({
      type: notifyType,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      from_email: event.data.from,
      direction: 'inbound',
    })

    const unreadCount = await notificationService.getUnreadCount()
    await broadcastRealtime(c.env, {
      type: notifyType,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      fromEmail: event.data.from,
      timestamp: new Date().toISOString(),
      unreadCount,
    })

    return c.json({ received: true })
  } catch (err) {
    console.error('[Resend Webhook] Error:', err)
    // Always return 200 to prevent Resend retries
    return c.json({ received: true })
  }
})

// ============================================
// Realtime WebSocket endpoint (Notifications)
// ============================================

// WebSocket upgrade endpoint (session-guarded)
app.get('/api/realtime/ws', async (c) => {
  const upgrade = c.req.header('Upgrade')
  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426)
  }

  // Verify admin session before allowing the connection
  try {
    const auth = createAuth(c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session?.user) return c.json({ error: 'Unauthorized' }, 401)
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const id = c.env.REALTIME_DO.idFromName('admin-hub')
  const stub = c.env.REALTIME_DO.get(id)
  return stub.fetch(c.req.raw)
})

// Better Auth handler
app.all('/api/auth/*', async (c) => {
  try {
    const auth = createAuth(c.env)
    const { runMigrations } = await getMigrations(auth.options)
    await runMigrations()
    return await auth.handler(c.req.raw)
  } catch (err: any) {
    console.error('[Better Auth]', err?.message || err)
    return c.json({ success: false, message: err?.message || 'Auth error' }, 500)
  }
})

// Admin API routes (protected by session middleware)
app.route('/manage/api', adminRoutes)

// MCP Server endpoint
app.all('/mcp', async (c) => {
  const auth = c.req.header('Authorization')
  if (!auth || auth !== `Bearer ${c.env.MCP_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const handler = createMcpHandler(() => createMcpServer(c.env))
  return handler.fetch(c.req.raw)
})

// SPA fallback - serve assets, fallback to index.html for client-side routing
app.all('*', async (c) => {
  const url = new URL(c.req.url)

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return c.json({ success: false, message: 'Endpoint not found' }, 404)
  }

  // Try to serve static asset
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
  if (assetResponse.status !== 404) {
    return assetResponse
  }

  // SPA fallback - serve index.html for client-side routing
  const indexResponse = await c.env.ASSETS.fetch(new URL('/index.html', c.req.url))
  return indexResponse
})

app.onError((_err, c) => c.json({ success: false, message: 'Internal server error' }, 500))

export default app
