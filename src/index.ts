import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { LicenseService } from './services/license'
import { EnvatoService } from './services/envato'
import { SignatureService } from './services/signature'
import { PluginService } from './services/plugin'
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

  if (payload.iss !== 'api.chaton.pro') return c.json({ error: 'token_invalid', message: 'Invalid token issuer' }, 401)

  const db = c.env.DB
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
  // Validate Bearer token
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
