import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod/v4"
import { signHs256 } from "../services/jwt"
import { TicketService } from "../services/ticket"
import { ContactService } from "../services/contact"
import { NotificationService } from "../services/notification"
import { EnvatoService } from "../services/envato"
import { ResendService } from "../services/resend"
import { AppUpdateService } from "../services/appUpdate"

interface McpEnv {
  DB: D1Database
  DOWNLOAD_TOKEN_SECRET?: string
  API_BASE_URL?: string
  ENVATO_PERSONAL_TOKEN?: string
  ENVATO_API_URL?: string
  RESEND_API_KEY?: string
  TICKET_FROM_EMAIL?: string
  TICKET_FROM_NAME?: string
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
      description: "Create a new license manually. Requires purchase_code and domain. Optionally set license_type (regular/extended), buyer info.",
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
    "generate_plugin_download_link",
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

  // ─── Ticket (Support) Tools ─────────────────────────────────────

  server.registerTool(
    "get_tickets",
    {
      description: "List support tickets with optional filtering. Shows ticket number, customer email, subject, status, priority, message count, contact badge info (lead/customer + support status), and last message time.",
      inputSchema: z.object({
        status: z.enum(["all", "open", "pending", "closed", "merged"]).optional().describe("Filter by ticket status, defaults to all (excludes merged unless 'merged' is chosen)"),
        search: z.string().optional().describe("Search across ticket number, sender email, and subject"),
        sort: z.enum(["newest", "oldest"]).optional().describe("Sort by last message time, defaults to newest"),
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 50, max 200"),
      }),
    },
    async ({ status, search, sort, page, limit }) => {
      const ticketService = new TicketService(env.DB)
      const result = await ticketService.getTicketsPaginated(page || 1, Math.min(limit || 50, 200), {
        status: status === "all" ? undefined : status,
        search,
        sort,
      })
      return text(JSON.stringify({
        tickets: result.tickets,
        pagination: { page: page || 1, limit: Math.min(limit || 50, 200), total: result.total, totalPages: Math.ceil(result.total / Math.min(limit || 50, 200)) },
      }, null, 2))
    }
  )

  server.registerTool(
    "get_ticket",
    {
      description: "Get full detail of a single ticket by ticket number. Includes all messages with attachments, thread participants, merged-ticket context, and linked contact info (purchases, support status).",
      inputSchema: z.object({
        ticket_number: z.string().describe("The ticket number (e.g. TICKET-00002)"),
      }),
    },
    async ({ ticket_number }) => {
      const ticketService = new TicketService(env.DB)
      const ticket = await ticketService.getTicketByNumber(ticket_number)
      if (!ticket) return text(`Ticket not found: ${ticket_number}`)

      const messages = await ticketService.getTicketMessages(ticket.id)
      const messagesWithAttachments = await Promise.all(
        messages.map(async (msg) => ({
          ...msg,
          attachments: await ticketService.getMessageAttachments(msg.id),
        }))
      )
      const participants = await ticketService.getParticipants(ticket.id)
      const mergedIntoTicket = await ticketService.getMergedIntoTicket(ticket.id)
      const mergedSources = await ticketService.getMergedSources(ticket.id)

      let contact = null
      const contactService = new ContactService(env.DB)
      if (ticket.contact_id) {
        contact = await contactService.getContactDetail(ticket.contact_id)
      } else if (ticket.from_email) {
        const byEmail = await contactService.getContactByEmail(ticket.from_email)
        if (byEmail) contact = await contactService.getContactDetail(byEmail.id)
      }

      return text(JSON.stringify({
        ticket,
        messages: messagesWithAttachments,
        participants,
        merged_into_ticket: mergedIntoTicket,
        merged_sources: mergedSources,
        contact: contact
          ? {
              id: contact.id,
              email: contact.email,
              name: contact.name,
              type: contact.type,
              support_status: contact.support_status,
              latest_purchase_code: contact.latest_purchase_code,
              latest_license_type: contact.latest_license_type,
              latest_support_until: contact.latest_support_until,
              purchases: contact.purchases,
            }
          : null,
      }, null, 2))
    }
  )

  server.registerTool(
    "get_ticket_attachments",
    {
      description: "List all attachments across a ticket's messages (filename, content type, size, which message they belong to). Use with generate_attachment_download_link to fetch the actual files.",
      inputSchema: z.object({
        ticket_number: z.string().describe("The ticket number (e.g. TICKET-00002)"),
      }),
    },
    async ({ ticket_number }) => {
      const ticketService = new TicketService(env.DB)
      const ticket = await ticketService.getTicketByNumber(ticket_number)
      if (!ticket) return text(`Ticket not found: ${ticket_number}`)

      const messages = await ticketService.getTicketMessages(ticket.id)
      const attachments = []
      for (const msg of messages) {
        const msgAttachments = await ticketService.getMessageAttachments(msg.id)
        for (const att of msgAttachments) {
          attachments.push({
            attachment_id: att.id,
            message_id: msg.id,
            direction: msg.direction,
            from_email: msg.from_email,
            filename: att.filename,
            content_type: att.content_type,
            file_size: att.file_size,
            created_at: att.created_at,
          })
        }
      }

      return text(JSON.stringify({
        ticket_number,
        count: attachments.length,
        attachments,
      }, null, 2))
    }
  )

  server.registerTool(
    "generate_attachment_download_link",
    {
      description: "Generate a one-time download link for a ticket attachment. Returns a URL and a JWT token that must be sent as the X-Download-Token header. Token expires in 1 hour and is single-use.",
      inputSchema: z.object({
        attachment_id: z.number().describe("The attachment ID (get it from get_ticket or get_ticket_attachments)"),
      }),
    },
    async ({ attachment_id }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")

      const ticketService = new TicketService(env.DB)
      const attachment = await ticketService.getAttachmentById(attachment_id)
      if (!attachment) return text(`Error: Attachment ${attachment_id} not found`)

      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 3600

      const token = await signHs256(
        {
          sub: "admin-mcp",
          type: "ticket-attachment",
          attachmentId: attachment.id,
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"
      const download_url = `${baseUrl}/downloads/attachments/${attachment.id}`

      return text(JSON.stringify({
        download_url,
        token,
        filename: attachment.filename,
        content_type: attachment.content_type,
        file_size: attachment.file_size,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: `Use curl or fetch: curl -H "X-Download-Token: ${token.slice(0, 20)}..." ${download_url}`,
      }, null, 2))
    }
  )

  server.registerTool(
    "update_ticket_status",
    {
      description: "Change a ticket's status: open, pending, or closed. Also logs a notification so other admin clients see the change.",
      inputSchema: z.object({
        ticket_number: z.string().describe("The ticket number (e.g. TICKET-00002)"),
        status: z.enum(["open", "pending", "closed"]).describe("New ticket status"),
      }),
    },
    async ({ ticket_number, status }) => {
      const ticketService = new TicketService(env.DB)
      const ticket = await ticketService.getTicketByNumber(ticket_number)
      if (!ticket) return text(`Ticket not found: ${ticket_number}`)

      await ticketService.updateTicket(ticket_number, { status })

      const notificationService = new NotificationService(env.DB)
      await notificationService.create({
        type: "ticket_status_changed",
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
      })

      return text(JSON.stringify({ success: true, ticket_number, old_status: ticket.status, new_status: status }, null, 2))
    }
  )

  server.registerTool(
    "update_ticket_priority",
    {
      description: "Change a ticket's priority: low, medium, or high.",
      inputSchema: z.object({
        ticket_number: z.string().describe("The ticket number (e.g. TICKET-00002)"),
        priority: z.enum(["low", "medium", "high"]).describe("New priority"),
      }),
    },
    async ({ ticket_number, priority }) => {
      const ticketService = new TicketService(env.DB)
      const ticket = await ticketService.getTicketByNumber(ticket_number)
      if (!ticket) return text(`Ticket not found: ${ticket_number}`)

      await ticketService.updateTicket(ticket_number, { priority })
      return text(JSON.stringify({ success: true, ticket_number, old_priority: ticket.priority, new_priority: priority }, null, 2))
    }
  )

  server.registerTool(
    "reply_ticket",
    {
      description: "Send an email reply to a ticket and store the outbound message. The reply goes to the ticket owner with non-admin participants CC'd. Includes the tracking footer and threading headers so the customer's next reply stays in the same ticket.",
      inputSchema: z.object({
        ticket_number: z.string().describe("The ticket number (e.g. TICKET-00002)"),
        body_html: z.string().describe("HTML body of the reply"),
        body_text: z.string().optional().describe("Plain-text alternative of the reply"),
      }),
    },
    async ({ ticket_number, body_html, body_text }) => {
      const ticketService = new TicketService(env.DB)
      const ticket = await ticketService.getTicketByNumber(ticket_number)
      if (!ticket) return text(`Ticket not found: ${ticket_number}`)
      if (!env.RESEND_API_KEY) return text("Error: RESEND_API_KEY not configured")

      const allReferences = await ticketService.getAllReferences(ticket.id)
      const messages = await ticketService.getTicketMessages(ticket.id)
      const lastMessage = messages[messages.length - 1]

      const sentAt = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
      const footerHtml = `
        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">Ticket ID: ${ticket.ticket_number}</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:2px;">Sent at: ${sentAt}</div>
        </div>`
      let bodyHtml = `${body_html}\n${footerHtml}`
      let bodyText = body_text
      if (bodyText) bodyText = `${bodyText}\n\n--\nTicket ID: ${ticket.ticket_number}\nSent at: ${sentAt}`

      const headers: Record<string, string> = {}
      if (lastMessage?.message_id) {
        headers["In-Reply-To"] = lastMessage.message_id
        if (allReferences.length > 0) {
          headers["References"] = [...allReferences, lastMessage.message_id].join(" ")
        }
      }

      const resendService = new ResendService(env as any)
      const fromName = env.TICKET_FROM_NAME || "Chatloka Support"
      const fromEmail = env.TICKET_FROM_EMAIL || "contact@support.chatloka.net"
      const from = `${fromName} <${fromEmail}>`
      const participants = (await ticketService.getParticipants(ticket.id)).filter((email) => {
        const normalized = email.toLowerCase()
        return normalized !== ticket.from_email.toLowerCase() && normalized !== fromEmail.toLowerCase()
      })

      const result = await resendService.sendEmail({
        from,
        to: [ticket.from_email],
        cc: participants.length > 0 ? participants : undefined,
        subject: `Re: [${ticket.ticket_number}] ${ticket.subject}`,
        html: bodyHtml,
        text: bodyText,
        headers,
      })

      let sentMessageId = result.id
      try {
        const sent = await resendService.getSentEmail(result.id)
        if (sent?.message_id) sentMessageId = sent.message_id
      } catch (e: any) {
        console.error("[MCP Reply] Failed to fetch sent Message-ID:", e)
      }

      const message = await ticketService.createMessage({
        ticket_id: ticket.id,
        direction: "outbound",
        from_email: fromEmail,
        to_email: ticket.from_email,
        subject: `Re: ${ticket.subject}`,
        body_html: bodyHtml,
        body_text: bodyText,
        resend_email_id: result.id,
        message_id: sentMessageId,
        has_attachments: 0,
      })

      await ticketService.createEmailThread({
        ticket_id: ticket.id,
        message_id: sentMessageId,
        parent_message_id: lastMessage?.message_id,
      })

      const notificationService = new NotificationService(env.DB)
      await notificationService.create({
        type: "ticket_replied",
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
        from_email: fromEmail,
        direction: "outbound",
        summary: bodyText?.slice(0, 200),
      })

      return text(JSON.stringify({
        success: true,
        message_id: result.id,
        message_record_id: message.id,
        to: ticket.from_email,
        cc: participants,
        subject: `Re: [${ticket.ticket_number}] ${ticket.subject}`,
      }, null, 2))
    }
  )

  server.registerTool(
    "merge_tickets",
    {
      description: "Merge one or more source tickets into a target ticket (by number) or into a freshly created container ticket. Sources are marked 'merged', their messages and participants move to the target, and an automated note is added for the audit trail.",
      inputSchema: z.object({
        source_ticket_numbers: z.array(z.string()).describe("Tickets to merge in"),
        target_ticket_number: z.string().optional().describe("Existing ticket to merge into. If omitted, a new container ticket is created"),
        new_ticket_subject: z.string().optional().describe("Subject for the new container ticket (only used when target_ticket_number is omitted)"),
      }),
    },
    async ({ source_ticket_numbers, target_ticket_number, new_ticket_subject }) => {
      const ticketService = new TicketService(env.DB)
      const sourceNumbers = (source_ticket_numbers || []).map((s: string) => s.trim()).filter(Boolean)
      if (sourceNumbers.length === 0) return text("Error: Select at least one ticket to merge")

      let target
      const wantedTarget = target_ticket_number?.trim()
      if (wantedTarget) {
        const found = await ticketService.getTicketByNumber(wantedTarget)
        if (!found) return text(`Error: Target ticket not found: ${wantedTarget}`)
        if (found.status === "merged") return text(`Error: Cannot merge into an already-merged ticket: ${wantedTarget}`)
        target = found
      } else {
        const firstSource = await ticketService.getTicketByNumber(sourceNumbers[0])
        if (!firstSource) return text(`Error: Source ticket not found: ${sourceNumbers[0]}`)
        const ticketNumber = await ticketService.generateTicketNumber()
        target = await ticketService.createTicket({
          ticket_number: ticketNumber,
          from_email: firstSource.from_email,
          subject: new_ticket_subject?.trim() || firstSource.subject,
        })
      }

      const sourceTicketIds: number[] = []
      for (const num of sourceNumbers) {
        const t = await ticketService.getTicketByNumber(num)
        if (!t) return text(`Error: Ticket not found: ${num}`)
        sourceTicketIds.push(t.id)
      }

      try {
        const { movedMessages, mergedCount } = await ticketService.mergeTickets(target.id, sourceTicketIds)

        for (const num of sourceNumbers) {
          const source = await ticketService.getTicketByNumber(num)
          if (!source) continue
          const noteHtml = `<p>This ticket was merged into <strong>${target.ticket_number}</strong> — <code>${source.ticket_number}</code> (${source.from_email}) was combined into this conversation.</p>`
          await ticketService.createMessage({
            ticket_id: target.id,
            direction: "outbound",
            from_email: "system",
            to_email: target.from_email,
            subject: `Merged ticket ${source.ticket_number}`,
            body_html: noteHtml,
            body_text: `Merged ticket ${source.ticket_number} into ${target.ticket_number}.`,
            is_automated: 1,
          })
        }

        return text(JSON.stringify({
          success: true,
          target_ticket_number: target.ticket_number,
          merged_count: mergedCount,
          moved_messages: movedMessages,
          source_tickets: sourceNumbers,
        }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Merge failed" }, null, 2))
      }
    }
  )

  server.registerTool(
    "get_ticket_stats",
    {
      description: "Get support ticket statistics: total, open, pending, and closed ticket counts.",
      inputSchema: z.object({}),
    },
    async () => {
      const ticketService = new TicketService(env.DB)
      const stats = await ticketService.getTicketStats()
      return text(JSON.stringify(stats, null, 2))
    }
  )

  server.registerTool(
    "get_ticket_analytics",
    {
      description: "Get ticket analytics bucketed in WIB (UTC+7): first-response & average-response times, per-weekday and per-hour breakdowns, and slowest reply gaps. Useful for measuring support performance.",
      inputSchema: z.object({}),
    },
    async () => {
      const ticketService = new TicketService(env.DB)
      const analytics = await ticketService.getAnalytics()
      return text(JSON.stringify(analytics, null, 2))
    }
  )

  server.registerTool(
    "get_unread_tickets",
    {
      description: "Get tickets whose latest message came from a customer and has not yet been seen by the admin (unread inbox). Ordered by most recent first.",
      inputSchema: z.object({
        limit: z.number().optional().describe("Max results, defaults to 50"),
      }),
    },
    async ({ limit }) => {
      const ticketService = new TicketService(env.DB)
      const tickets = await ticketService.getUnreadTickets()
      return text(JSON.stringify({ count: tickets.length, tickets: tickets.slice(0, limit || 50) }, null, 2))
    }
  )

  server.registerTool(
    "mark_tickets_read",
    {
      description: "Mark one ticket as read by the admin (ticket_number), or mark ALL unread tickets as read when no ticket_number is given. This clears the 'unread' state used by the support inbox.",
      inputSchema: z.object({
        ticket_number: z.string().optional().describe("Mark a single ticket read. Omit to mark all unread tickets read"),
      }),
    },
    async ({ ticket_number }) => {
      const ticketService = new TicketService(env.DB)
      if (ticket_number) {
        const ticket = await ticketService.getTicketByNumber(ticket_number)
        if (!ticket) return text(`Ticket not found: ${ticket_number}`)
        await ticketService.markTicketSeen(ticket.id)
        return text(JSON.stringify({ success: true, marked_read: [ticket_number] }, null, 2))
      }
      const unread = await ticketService.getUnreadTickets()
      for (const t of unread) {
        await ticketService.markTicketSeen(t.id)
      }
      return text(JSON.stringify({ success: true, marked_read_count: unread.length }, null, 2))
    }
  )

  // ─── Contacts & Users Tools ────────────────────────────────────

  server.registerTool(
    "get_contacts",
    {
      description: "List contacts (people who message support) with their type (lead/customer), latest purchase code, license type, support status (active/expired/none), and ticket count. Search by email/name/purchase code.",
      inputSchema: z.object({
        search: z.string().optional().describe("Search across email, name, and purchase code"),
        type: z.enum(["lead", "customer"]).optional().describe("Filter by contact type"),
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 20, max 100"),
      }),
    },
    async ({ search, type, page, limit }) => {
      const contactService = new ContactService(env.DB)
      const result = await contactService.getContactsPaginated(page || 1, Math.min(limit || 20, 100), {
        search,
        type,
      })
      return text(JSON.stringify({
        contacts: result.contacts,
        pagination: { page: page || 1, limit: Math.min(limit || 20, 100), total: result.total, totalPages: Math.ceil(result.total / Math.min(limit || 20, 100)) },
      }, null, 2))
    }
  )

  server.registerTool(
    "get_contact",
    {
      description: "Get full detail of a contact: profile, all linked purchase codes (with support expiry), support status, and their support ticket history.",
      inputSchema: z.object({
        contact_id: z.number().optional().describe("Contact ID"),
        email: z.string().optional().describe("Or look up by email address"),
      }),
    },
    async ({ contact_id, email }) => {
      const contactService = new ContactService(env.DB)
      let contact = null
      if (contact_id) {
        contact = await contactService.getContactDetail(contact_id)
      } else if (email) {
        const byEmail = await contactService.getContactByEmail(email)
        if (byEmail) contact = await contactService.getContactDetail(byEmail.id)
      } else {
        return text("Error: Provide contact_id or email")
      }
      if (!contact) return text("Contact not found")
      return text(JSON.stringify(contact, null, 2))
    }
  )

  server.registerTool(
    "add_contact_purchase",
    {
      description: "Attach a purchase code to a contact and promote them to a Customer (Lead → Customer). Optionally auto-verify against Envato to fill in item name, purchase date, support until, and license type.",
      inputSchema: z.object({
        contact_id: z.number().describe("The contact's database ID"),
        purchase_code: z.string().describe("The Envato purchase code"),
        verify: z.boolean().optional().describe("Auto-verify against Envato to fill item/license/support fields, defaults to true"),
        license_type: z.enum(["regular", "extended"]).optional().describe("Manual license type (used when verify is false)"),
        item_name: z.string().optional().describe("Manual item name"),
        purchase_date: z.string().optional().describe("Manual purchase date (ISO)"),
        support_until: z.string().optional().describe("Manual support-expiry date (ISO)"),
      }),
    },
    async ({ contact_id, purchase_code, verify, license_type, item_name, purchase_date, support_until }) => {
      const contactService = new ContactService(env.DB)
      const shouldVerify = verify !== false

      let input: Parameters<ContactService["addPurchase"]>[1] = {
        purchase_code,
        license_type: license_type || "regular",
        item_name: item_name || null,
        purchase_date: purchase_date || null,
        support_until: support_until || null,
        source: "manual",
      }

      if (shouldVerify) {
        const envato = new EnvatoService(env as any)
        const res = await envato.verifyPurchaseCode(purchase_code)
        if (!res.valid || !res.purchase) {
          return text(JSON.stringify({ success: false, error: res.error || "Purchase code could not be verified" }, null, 2))
        }
        input = {
          purchase_code,
          license_type: res.purchase.license,
          item_name: res.purchase.item?.name || null,
          purchase_date: res.purchase.sold_at,
          support_until: res.purchase.supported_until || null,
          source: "envato",
        }
      }

      try {
        const purchase = await contactService.addPurchase(contact_id, input)
        return text(JSON.stringify({ success: true, purchase, contactType: "customer" }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to add purchase" }, null, 2))
      }
    }
  )

  server.registerTool(
    "update_contact_purchase",
    {
      description: "Update a contact's purchase record (license type, item name, purchase date, support expiry). Use to adjust a mistakenly-entered purchase or extend support.",
      inputSchema: z.object({
        purchase_id: z.number().describe("The purchase record ID"),
        license_type: z.enum(["regular", "extended"]).optional(),
        item_name: z.string().optional(),
        purchase_date: z.string().optional().describe("ISO date"),
        support_until: z.string().optional().describe("ISO date"),
        support_term_months: z.number().optional().describe("Support term in months (6 or 12)"),
      }),
    },
    async ({ purchase_id, license_type, item_name, purchase_date, support_until, support_term_months }) => {
      const contactService = new ContactService(env.DB)
      try {
        const purchase = await contactService.updatePurchase(purchase_id, {
          license_type,
          item_name,
          purchase_date,
          support_until,
          support_term_months,
        })
        if (!purchase) return text("Purchase not found")
        return text(JSON.stringify({ success: true, purchase }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to update purchase" }, null, 2))
      }
    }
  )

  server.registerTool(
    "remove_contact_purchase",
    {
      description: "Remove a purchase code from a contact. If it was the contact's last purchase code, the contact is demoted from Customer back to Lead.",
      inputSchema: z.object({
        purchase_id: z.number().describe("The purchase record ID"),
      }),
    },
    async ({ purchase_id }) => {
      const contactService = new ContactService(env.DB)
      const result = await contactService.deletePurchase(purchase_id)
      return text(JSON.stringify({ success: true, ...result }, null, 2))
    }
  )

  server.registerTool(
    "update_contact",
    {
      description: "Update a contact's name or internal admin notes.",
      inputSchema: z.object({
        contact_id: z.number().describe("Contact ID"),
        name: z.string().optional().describe("New display name"),
        notes: z.string().optional().describe("Admin notes visible only in the admin panel"),
      }),
    },
    async ({ contact_id, name, notes }) => {
      const contactService = new ContactService(env.DB)
      if (name !== undefined) await contactService.updateContactName(contact_id, name)
      if (notes !== undefined) await contactService.updateContactNotes(contact_id, notes)
      const updated = await contactService.getContactDetail(contact_id)
      return text(JSON.stringify({ success: true, contact: updated }, null, 2))
    }
  )

  // ─── App Release Tools ──────────────────────────────────────────

  server.registerTool(
    "get_app_versions",
    {
      description: "List all Chatloka application release versions with changelog, checksum, PHP requirements, breaking changes, and which is the latest. Useful for checking what upgrade clients will receive.",
      inputSchema: z.object({}),
    },
    async () => {
      const service = new AppUpdateService(env.DB)
      const versions = await service.getAllVersions()
      return text(JSON.stringify({ count: versions.length, versions }, null, 2))
    }
  )

  server.registerTool(
    "generate_release_download_link",
    {
      description: "Generate a one-time download link for a Chatloka app release version (like generate_plugin_download_link but for the Chatloka core app). Returns a URL and a JWT token that must be sent as the X-Download-Token header. Token expires in 1 hour and is single-use.",
      inputSchema: z.object({
        version: z.string().optional().describe("Specific release version, defaults to the latest"),
        purchase_code: z.string().optional().describe("Purchase code recorded on the token, defaults to admin-mcp"),
      }),
    },
    async ({ version, purchase_code }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")

      const service = new AppUpdateService(env.DB)
      let appVersion
      if (version) {
        appVersion = await service.getVersionByVersion(version)
      } else {
        appVersion = await service.getLatestVersion()
      }
      if (!appVersion) return text(`Error: Release${version ? ` v${version}` : ""} not found`)
      if (!appVersion.checksum) return text(`Error: Release ${appVersion.version} is not available for download (missing checksum)`)

      const sub = purchase_code || "admin-mcp"
      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 3600

      const token = await signHs256(
        {
          sub,
          type: "app-update",
          version: appVersion.version,
          domain: "mcp-generated",
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"
      const filename = `chatloka-${appVersion.version}.zip`
      const download_url = `${baseUrl}/downloads/${filename}`

      return text(JSON.stringify({
        download_url,
        token,
        filename,
        version: appVersion.version,
        checksum: appVersion.checksum,
        file_size: appVersion.file_size,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: `Use curl or fetch: curl -H "X-Download-Token: ${token.slice(0, 20)}..." ${download_url}`,
      }, null, 2))
    }
  )

  server.registerTool(
    "get_app_update_logs",
    {
      description: "Search client-side app-update logs: which licenses/domains upgraded/downgraded between which versions, success or failure, and error messages.",
      inputSchema: z.object({
        search: z.string().optional().describe("Search across purchase code and domain"),
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 50"),
      }),
    },
    async ({ search, page, limit }) => {
      const service = new AppUpdateService(env.DB)
      const result = await service.getUpdateLogs(page || 1, limit || 50, search)
      return text(JSON.stringify({
        logs: result.logs,
        pagination: { page: page || 1, limit: limit || 50, total: result.total, totalPages: Math.ceil(result.total / (limit || 50)) },
      }, null, 2))
    }
  )

  // ─── Notifications Tools ────────────────────────────────────────

  server.registerTool(
    "get_notifications",
    {
      description: "Get admin notification feed (ticket created, new reply, status changed, reopened). Shows type, ticket, sender, summary, and which are unread.",
      inputSchema: z.object({
        page: z.number().optional().describe("Page number, defaults to 1"),
        limit: z.number().optional().describe("Results per page, defaults to 50"),
      }),
    },
    async ({ page, limit }) => {
      const notificationService = new NotificationService(env.DB)
      const unread = await notificationService.getUnreadCount()
      const result = await notificationService.getPaginated(page || 1, limit || 50)
      return text(JSON.stringify({
        unread_count: unread,
        pagination: { page: page || 1, limit: limit || 50, total: result.total, totalPages: Math.ceil(result.total / (limit || 50)) },
        notifications: result.notifications,
      }, null, 2))
    }
  )

  server.registerTool(
    "mark_notifications_read",
    {
      description: "Mark a single notification read (by id) or all notifications read.",
      inputSchema: z.object({
        notification_id: z.number().optional().describe("Mark a single notification read. Omit to mark all read"),
      }),
    },
    async ({ notification_id }) => {
      const notificationService = new NotificationService(env.DB)
      if (notification_id) {
        const marked = await notificationService.markRead(notification_id)
        return text(JSON.stringify({ success: marked, marked_count: marked ? 1 : 0 }, null, 2))
      }
      const count = await notificationService.markAllRead()
      return text(JSON.stringify({ success: true, marked_count: count }, null, 2))
    }
  )

  return server
}
