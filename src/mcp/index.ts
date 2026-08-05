import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod/v4"
import { signHs256 } from "../services/jwt"

interface McpEnv {
  DB: D1Database
  DOWNLOAD_TOKEN_SECRET?: string
  API_BASE_URL?: string
  ENVATO_PERSONAL_TOKEN?: string
  ENVATO_API_URL?: string
}

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] }
}

export function createMcpServer(env: McpEnv) {
  const server = new McpServer({
    name: "chatloka",
    version: "1.0.0",
  })

  // ─── License Tools ───────────────────────────────────────────────

  server.registerTool(
    "get_licenses",
    {
      description: "Get all licenses. Returns purchase code, domain, status, buyer info, license type, and timestamps for every license in the system.",
      inputSchema: z.object({}),
    },
    async () => {
      const { results } = await env.DB.prepare(
        "SELECT id, purchase_code, license_type, domain, buyer_email, buyer_name, status, activated_at, last_validated_at, created_at, updated_at FROM licenses ORDER BY created_at DESC"
      ).all()
      return text(JSON.stringify(results, null, 2))
    }
  )

  server.registerTool(
    "get_license",
    {
      description: "Get a single license by purchase code. Returns full license details including item info, support expiry, and all timestamps.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The purchase code to look up"),
      }),
    },
    async ({ purchase_code }) => {
      const row = await env.DB.prepare(
        "SELECT * FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (!row) return text(`License not found for purchase code: ${purchase_code}`)
      return text(JSON.stringify(row, null, 2))
    }
  )

  server.registerTool(
    "create_license",
    {
      description: "Create a new license manually. Requires purchase_code and domain. Optionally set license_type (regular/extended/lifetime), buyer info.",
      inputSchema: z.object({
        purchase_code: z.string().describe("Unique purchase code"),
        domain: z.string().describe("Domain to bind the license to"),
        license_type: z.enum(["regular", "extended"]).optional().describe("License type, defaults to regular"),
        buyer_email: z.string().optional().describe("Buyer email address"),
        buyer_name: z.string().optional().describe("Buyer name"),
      }),
    },
    async ({ purchase_code, domain, license_type, buyer_email, buyer_name }) => {
      const existing = await env.DB.prepare(
        "SELECT id FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (existing) return text(`Error: License with purchase code '${purchase_code}' already exists`)

      await env.DB.prepare(
        `INSERT INTO licenses (purchase_code, license_type, domain, buyer_email, buyer_name, status, activated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'), datetime('now'))`
      ).bind(purchase_code, license_type || "regular", domain, buyer_email || null, buyer_name || null).run()

      return text(JSON.stringify({ success: true, message: `License created for '${purchase_code}' on domain '${domain}'` }, null, 2))
    }
  )

  server.registerTool(
    "update_license_status",
    {
      description: "Change a license's status. Valid values: active, deactivated, suspended.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The purchase code of the license"),
        status: z.enum(["active", "deactivated", "suspended"]).describe("New status"),
      }),
    },
    async ({ purchase_code, status }) => {
      const existing = await env.DB.prepare(
        "SELECT id, status FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (!existing) return text(`Error: License not found for '${purchase_code}'`)

      await env.DB.prepare(
        "UPDATE licenses SET status = ?, updated_at = datetime('now') WHERE purchase_code = ?"
      ).bind(status, purchase_code).run()

      return text(JSON.stringify({ success: true, purchase_code, old_status: existing.status, new_status: status }, null, 2))
    }
  )

  server.registerTool(
    "update_license_domain",
    {
      description: "Change the domain bound to a license. Logs the change to domain_history.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The purchase code of the license"),
        new_domain: z.string().describe("The new domain to bind"),
      }),
    },
    async ({ purchase_code, new_domain }) => {
      const existing = await env.DB.prepare(
        "SELECT id, domain FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (!existing) return text(`Error: License not found for '${purchase_code}'`)

      const old_domain = existing.domain as string

      await env.DB.prepare(
        "UPDATE licenses SET domain = ?, updated_at = datetime('now') WHERE purchase_code = ?"
      ).bind(new_domain, purchase_code).run()

      await env.DB.prepare(
        "INSERT INTO domain_history (license_id, old_domain, new_domain, changed_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(existing.id, old_domain, new_domain).run()

      return text(JSON.stringify({ success: true, purchase_code, old_domain, new_domain }, null, 2))
    }
  )

  server.registerTool(
    "verify_purchase_code",
    {
      description: "Verify a purchase code against the Envato API. Checks if the code is valid, revoked, and returns purchase details.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The Envato purchase code to verify"),
      }),
    },
    async ({ purchase_code }) => {
      if (!env.ENVATO_PERSONAL_TOKEN) return text("Error: ENVATO_PERSONAL_TOKEN not configured")
      const apiUrl = env.ENVATO_API_URL || "https://api.envato.com/v3/market"

      try {
        const resp = await fetch(`${apiUrl}/author/sale?code=${purchase_code}`, {
          headers: { Authorization: `Bearer ${env.ENVATO_PERSONAL_TOKEN}` },
        })

        if (resp.status === 404) {
          return text(JSON.stringify({ valid: false, error: "Purchase code not found" }, null, 2))
        }
        if (resp.status === 410) {
          return text(JSON.stringify({ valid: false, revoked: true, error: "Purchase code has been revoked or refunded" }, null, 2))
        }
        if (!resp.ok) {
          return text(JSON.stringify({ valid: false, error: `Envato API error: ${resp.status}` }, null, 2))
        }

        const data = await resp.json() as any
        return text(JSON.stringify({
          valid: true,
          purchase: {
            buyer: data.buyer,
            license: data.license,
            item: data.item,
            sold_at: data.sold_at,
            supported_until: data.supported_until,
          },
        }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ valid: false, error: e?.message || "Failed to verify" }, null, 2))
      }
    }
  )

  server.registerTool(
    "get_license_features",
    {
      description: "Get the feature list for a license type. Shows which features are available for regular vs extended licenses.",
      inputSchema: z.object({
        license_type: z.enum(["regular", "extended"]).describe("License type to check"),
      }),
    },
    async ({ license_type }) => {
      const isExtended = license_type === "extended"
      const features = {
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
      return text(JSON.stringify({ license_type, features }, null, 2))
    }
  )

  server.registerTool(
    "get_validation_logs",
    {
      description: "Get validation history for a license. Shows activation, validation, and deactivation attempts with IP and user agent.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The purchase code to get logs for"),
        limit: z.number().optional().describe("Max results, defaults to 50"),
      }),
    },
    async ({ purchase_code, limit }) => {
      const license = await env.DB.prepare(
        "SELECT id FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (!license) return text(`License not found for '${purchase_code}'`)

      const { results } = await env.DB.prepare(
        "SELECT * FROM validation_logs WHERE license_id = ? ORDER BY created_at DESC LIMIT ?"
      ).bind(license.id, limit || 50).all()
      return text(JSON.stringify({ purchase_code, logs: results }, null, 2))
    }
  )

  server.registerTool(
    "get_domain_history",
    {
      description: "Get domain change history for a license. Shows all previous domains and when they were changed.",
      inputSchema: z.object({
        purchase_code: z.string().describe("The purchase code to get domain history for"),
      }),
    },
    async ({ purchase_code }) => {
      const license = await env.DB.prepare(
        "SELECT id FROM licenses WHERE purchase_code = ?"
      ).bind(purchase_code).first()
      if (!license) return text(`License not found for '${purchase_code}'`)

      const { results } = await env.DB.prepare(
        "SELECT * FROM domain_history WHERE license_id = ? ORDER BY changed_at DESC"
      ).bind(license.id).all()
      return text(JSON.stringify({ purchase_code, history: results }, null, 2))
    }
  )

  // ─── Plugin Tools ────────────────────────────────────────────────

  server.registerTool(
    "get_plugins",
    {
      description: "List all plugins with their latest version, checksum, and release date. Returns one entry per unique plugin slug.",
      inputSchema: z.object({}),
    },
    async () => {
      const { results } = await env.DB.prepare(
        "SELECT slug, version, changelog, checksum, requires_chaton, released_at, is_latest FROM plugin_versions WHERE is_latest = 1 ORDER BY released_at DESC"
      ).all()
      return text(JSON.stringify(results, null, 2))
    }
  )

  server.registerTool(
    "get_plugin_versions",
    {
      description: "Get all versions for a specific plugin slug. Shows version history with changelogs and checksums.",
      inputSchema: z.object({
        slug: z.string().describe("The plugin slug to look up"),
      }),
    },
    async ({ slug }) => {
      const { results } = await env.DB.prepare(
        "SELECT id, slug, version, changelog, checksum, requires_chaton, released_at, is_latest FROM plugin_versions WHERE slug = ? ORDER BY released_at DESC"
      ).bind(slug).all()
      if (results.length === 0) return text(`No versions found for plugin '${slug}'`)
      return text(JSON.stringify({ slug, versions: results }, null, 2))
    }
  )

  server.registerTool(
    "get_plugin_download_logs",
    {
      description: "Get plugin download history. Optionally filter by slug. Shows who downloaded what, when, and from which IP.",
      inputSchema: z.object({
        slug: z.string().optional().describe("Filter by plugin slug"),
        limit: z.number().optional().describe("Max results, defaults to 50"),
      }),
    },
    async ({ slug, limit }) => {
      let query = "SELECT * FROM download_logs"
      const binds: string[] = []
      if (slug) {
        query += " WHERE slug = ?"
        binds.push(slug)
      }
      query += " ORDER BY downloaded_at DESC LIMIT ?"
      binds.push(String(limit || 50))

      const { results } = await env.DB.prepare(query).bind(...binds).all()
      return text(JSON.stringify({ slug: slug || "all", downloads: results }, null, 2))
    }
  )

  server.registerTool(
    "generate_plugin_download",
    {
      description: "Generate a download link for a plugin. Returns a URL and one-time JWT token. The client must use the token as X-Download-Token header to download the file.",
      inputSchema: z.object({
        slug: z.string().describe("Plugin slug"),
        version: z.string().optional().describe("Specific version, defaults to latest"),
        purchase_code: z.string().optional().describe("Purchase code for the token, defaults to admin"),
      }),
    },
    async ({ slug, version, purchase_code }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")

      let plugin
      if (version) {
        plugin = await env.DB.prepare(
          "SELECT slug, version, checksum, zip_path FROM plugin_versions WHERE slug = ? AND version = ?"
        ).bind(slug, version).first()
      } else {
        plugin = await env.DB.prepare(
          "SELECT slug, version, checksum, zip_path FROM plugin_versions WHERE slug = ? AND is_latest = 1"
        ).bind(slug).first()
      }

      if (!plugin) return text(`Error: Plugin '${slug}'${version ? ` v${version}` : ""} not found`)
      if (!plugin.checksum) return text(`Error: Plugin '${slug}' v${plugin.version} is not available for download (missing checksum)`)

      const sub = purchase_code || "admin-mcp"
      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 3600

      const token = await signHs256(
        {
          sub,
          slug: plugin.slug,
          version: plugin.version,
          domain: "mcp-generated",
          jti,
          iss: "api.chaton.pro",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"
      const filename = `${plugin.slug}-${plugin.version}.zip`
      const download_url = `${baseUrl}/downloads/${filename}`

      return text(JSON.stringify({
        download_url,
        token,
        filename,
        version: plugin.version,
        checksum: plugin.checksum,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: `Use curl or fetch: curl -H "X-Download-Token: ${token.slice(0, 20)}..." ${download_url}`,
      }, null, 2))
    }
  )

  // ─── Logs & Monitoring Tools ─────────────────────────────────────

  server.registerTool(
    "get_api_logs",
    {
      description: "Get API request logs with optional filtering. Shows endpoint, status code, response time, IP, user agent, and purchase code.",
      inputSchema: z.object({
        endpoint: z.string().optional().describe("Filter by endpoint path (partial match)"),
        status: z.number().optional().describe("Filter by HTTP status code"),
        search: z.string().optional().describe("Search across endpoint, IP, purchase_code, user_agent"),
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 50, max 200"),
        sort: z.enum(["newest", "oldest"]).optional().describe("Sort order, defaults to newest"),
      }),
    },
    async ({ endpoint, status, search, page, limit, sort }) => {
      const p = page || 1
      const l = Math.min(limit || 50, 200)
      const offset = (p - 1) * l
      const order = sort === "oldest" ? "ASC" : "DESC"

      let where = "WHERE 1=1"
      const binds: (string | number)[] = []

      if (endpoint) {
        where += " AND endpoint LIKE ?"
        binds.push(`%${endpoint}%`)
      }
      if (status) {
        where += " AND status_code = ?"
        binds.push(status)
      }
      if (search) {
        where += " AND (endpoint LIKE ? OR ip_address LIKE ? OR purchase_code LIKE ? OR user_agent LIKE ?)"
        const s = `%${search}%`
        binds.push(s, s, s, s)
      }

      const countResult = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM api_logs ${where}`
      ).bind(...binds).first()
      const total = (countResult as any)?.total || 0

      const { results } = await env.DB.prepare(
        `SELECT * FROM api_logs ${where} ORDER BY created_at ${order} LIMIT ? OFFSET ?`
      ).bind(...binds, l, offset).all()

      return text(JSON.stringify({
        logs: results,
        pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
      }, null, 2))
    }
  )

  server.registerTool(
    "get_tamper_logs",
    {
      description: "Get tamper detection logs. Shows which licenses had file integrity failures, with domain, IP, and failure details.",
      inputSchema: z.object({
        search: z.string().optional().describe("Search across domain and IP"),
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 50, max 200"),
        sort: z.enum(["newest", "oldest"]).optional().describe("Sort order, defaults to newest"),
      }),
    },
    async ({ search, page, limit, sort }) => {
      const p = page || 1
      const l = Math.min(limit || 50, 200)
      const offset = (p - 1) * l
      const order = sort === "oldest" ? "ASC" : "DESC"

      let where = "WHERE 1=1"
      const binds: string[] = []

      if (search) {
        where += " AND (domain LIKE ? OR ip LIKE ?)"
        const s = `%${search}%`
        binds.push(s, s)
      }

      const countResult = await env.DB.prepare(
        `SELECT COUNT(*) as total FROM tamper_logs ${where}`
      ).bind(...binds).first()
      const total = (countResult as any)?.total || 0

      const { results } = await env.DB.prepare(
        `SELECT * FROM tamper_logs ${where} ORDER BY created_at ${order} LIMIT ? OFFSET ?`
      ).bind(...binds, l, offset).all()

      return text(JSON.stringify({
        logs: results,
        pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
      }, null, 2))
    }
  )

  server.registerTool(
    "get_api_stats",
    {
      description: "Get API statistics for the last 24 hours. Shows total requests, success/error counts, and average response time.",
      inputSchema: z.object({}),
    },
    async () => {
      const stats = await env.DB.prepare(`
        SELECT
          COUNT(*) as total_requests,
          SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_error_count,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error_count,
          ROUND(AVG(response_time_ms)) as avg_response_time,
          MAX(response_time_ms) as max_response_time
        FROM api_logs
        WHERE created_at >= datetime('now', '-24 hours')
      `).first()

      const endpoints = await env.DB.prepare(`
        SELECT endpoint, COUNT(*) as count
        FROM api_logs
        WHERE created_at >= datetime('now', '-24 hours')
        GROUP BY endpoint
        ORDER BY count DESC
        LIMIT 10
      `).all()

      return text(JSON.stringify({ stats, top_endpoints: endpoints.results }, null, 2))
    }
  )

  server.registerTool(
    "get_dashboard_stats",
    {
      description: "Get aggregate dashboard statistics. Shows license counts by status, plugin counts, recent tamper attempts, and recent license activity.",
      inputSchema: z.object({}),
    },
    async () => {
      const licenseStats = await env.DB.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'deactivated' THEN 1 ELSE 0 END) as deactivated,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
        FROM licenses
      `).first()

      const pluginStats = await env.DB.prepare(`
        SELECT
          COUNT(DISTINCT slug) as total_plugins,
          COUNT(*) as total_versions
        FROM plugin_versions
      `).first()

      const recentTamper = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM tamper_logs
        WHERE created_at >= datetime('now', '-24 hours')
      `).first()

      const recentLicenses = await env.DB.prepare(`
        SELECT purchase_code, domain, status, license_type, created_at
        FROM licenses ORDER BY created_at DESC LIMIT 5
      `).all()

      return text(JSON.stringify({
        licenses: licenseStats,
        plugins: pluginStats,
        tamper_24h: (recentTamper as any)?.count || 0,
        recent_licenses: recentLicenses.results,
      }, null, 2))
    }
  )

  return server
}
