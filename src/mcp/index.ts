import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod/v4"
import { signHs256 } from "../services/jwt"
import { TicketService } from "../services/ticket"
import { ContactService } from "../services/contact"
import { NotificationService } from "../services/notification"
import { EnvatoService } from "../services/envato"
import { ResendService } from "../services/resend"
import { AppUpdateService } from "../services/appUpdate"
import { FileManagerService } from "../services/fileManager"

interface McpEnv {
  DB: D1Database
  DOWNLOAD_TOKEN_SECRET?: string
  API_BASE_URL?: string
  ENVATO_PERSONAL_TOKEN?: string
  ENVATO_API_URL?: string
  RESEND_API_KEY?: string
  TICKET_FROM_EMAIL?: string
  TICKET_FROM_NAME?: string
  PLUGINS_BUCKET?: R2Bucket
}

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] }
}

// Maximum inbound request body for the Workers plan (~100 MB) minus a safety
// margin. Files above this cannot pass through the worker and must go straight
// to R2 via rclone/AWS CLI (S3 multipart, resumable, up to 5 TiB).
const MAX_SIGNED_UPLOAD_BYTES = 95 * 1024 * 1024

const R2_BUCKET_NAME = "chatlokaapi"
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const SAFE_VERSION_RE = /^[0-9][0-9a-zA-Z.\-_]{0,63}$/
const APP_VERSION_RE = /^\d+\.\d+\.\d+/

function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug)
}

function isSafeVersion(version: string): boolean {
  return SAFE_VERSION_RE.test(version) && !version.includes("..") && !version.includes("//")
}

function isValidSha256(value: string): boolean {
  return SHA256_HEX_RE.test(value)
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

  // ─── Release Upload / Publish Tools ──────────────────────────────
  //
  // Releases are TWO steps on purpose:
  //   1. upload the .zip to R2 (generate_*_upload_link), streaming directly
  //   2. register the version in the database (publish_*)
  // The publish step is always manual and requires the SHA-256 of the zip.

  server.registerTool(
    "generate_plugin_upload_link",
    {
      description: "Step 1 of releasing a new plugin version from your machine/VPS: get a one-time signed URL to upload the .zip. Files up to 95 MB upload through the worker with curl -T; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). This tool does NOT register the version — call publish_plugin_version after the upload finishes.",
      inputSchema: z.object({
        slug: z.string().describe("Plugin slug (letters/digits/_/-)"),
        version: z.string().describe("New version to release (e.g. 1.2.0)"),
        file_size: z.number().optional().describe("Zip file size in bytes. If known and > 95 MB you get rclone instructions instead of a signed URL so it never hits the worker's request limit"),
      }),
    },
    async ({ slug, version, file_size }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")
      if (!env.PLUGINS_BUCKET) return text("Error: PLUGINS_BUCKET not configured")
      if (!isSafeSlug(slug)) return text(`Error: '${slug}' is not a valid plugin slug (use letters, digits, _ or -)`)
      if (!isSafeVersion(version)) return text(`Error: '${version}' is not a safe version string (letters, digits, dots, dashes, underscores only)`)

      const existing = await env.DB.prepare(
        "SELECT id FROM plugin_versions WHERE slug = ? AND version = ?"
      ).bind(slug, version).first()
      if (existing) return text(`Error: Plugin '${slug}' v${version} already exists. Pick a new version.`)

      const filename = `${slug}-${version}.zip`
      const zipPath = `plugins/${slug}/${version}/${filename}`
      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"

      if (file_size !== undefined && file_size > MAX_SIGNED_UPLOAD_BYTES) {
        return text(JSON.stringify({
          status: "use_rclone",
          release_type: "plugin",
          message: `File (${file_size} bytes) exceeds the 95 MB worker upload limit. Upload it directly to R2 with rclone or the AWS CLI (S3 multipart) instead of using the signed URL.`,
          target_bucket: R2_BUCKET_NAME,
          target_key: zipPath,
          filename,
          max_size_bytes: MAX_SIGNED_UPLOAD_BYTES,
          instructions: [
            `1. Compute the SHA-256 of the zip: sha256sum ${filename}`,
            `2. Upload straight to R2 (multipart + resumable): rclone copyto ./${filename} :s3,provider=Cloudflare:${R2_BUCKET_NAME}/${zipPath} --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `   Or with the AWS CLI: aws s3 cp ./${filename} s3://${R2_BUCKET_NAME}/${zipPath} --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `3. Verify it landed: rclone lsl :s3,provider=Cloudflare:${R2_BUCKET_NAME}/plugins/${slug}/${version}/ --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `4. Keep the SHA-256 hex string from step 1 — you MUST pass it to publish_plugin_version.`,
          ],
          next_step: `Call publish_plugin_version({ slug: "${slug}", version: "${version}", checksum: "<sha256 from step 1>" }) — the checksum is REQUIRED.`,
        }, null, 2))
      }

      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 900
      const token = await signHs256(
        {
          sub: "admin-mcp",
          kind: "upload",
          target: "plugin",
          slug,
          version,
          filename,
          zip_path: zipPath,
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const upload_url = `${baseUrl}/api/uploads/${token}`

      return text(JSON.stringify({
        status: "ready",
        release_type: "plugin",
        target: { slug, version, filename, zip_path: zipPath },
        upload_url,
        method: "PUT",
        token,
        max_size_bytes: MAX_SIGNED_UPLOAD_BYTES,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: [
          `1. Compute the SHA-256 of the zip (needed below and later for publish): sha256sum ${filename}`,
          `2. Stream the file to the signed URL. Use a real sha256 hex below:`,
          `   curl -T ${filename} -H "X-Checksum-SHA256: <sha256>" '${upload_url}'`,
          `3. Expect a 2xx JSON response { success: true, file_size, checksum }. The file is now in R2 but NOT yet registered in the database.`,
          `4. If you already used the URL (or it expired after 15 min), re-run this tool for a fresh token.`,
        ],
        next_step: `Call publish_plugin_version({ slug: "${slug}", version: "${version}", checksum: "<sha256 from step 1>" }) — the checksum is REQUIRED.`,
      }, null, 2))
    }
  )

  server.registerTool(
    "publish_plugin_version",
    {
      description: "Step 2 of releasing a plugin version. REGISTERS a version whose .zip is already in R2 (uploaded via generate_plugin_upload_link or rclone). It does NOT upload anything; it verifies the object exists in storage, then inserts the version row and marks it latest. Requires the SHA-256 checksum, which must be computed on the machine that has the zip (sha256sum).",
      inputSchema: z.object({
        slug: z.string().describe("Plugin slug"),
        version: z.string().describe("Version that was uploaded (e.g. 1.2.0)"),
        checksum: z.string().describe("REQUIRED. SHA-256 hex digest of the zip (run: sha256sum <zipfile>). Used for tamper-detection integrity checks"),
        changelog: z.string().optional().describe("Release notes / changelog"),
        requires_chaton: z.string().optional().describe("Minimum Chatloka app version required for this plugin (e.g. 1.4.0)"),
      }),
    },
    async ({ slug, version, checksum, changelog, requires_chaton }) => {
      const bucket = env.PLUGINS_BUCKET
      if (!bucket) return text("Error: PLUGINS_BUCKET not configured")
      if (!isSafeSlug(slug)) return text(`Error: '${slug}' is not a valid plugin slug`)
      if (!isValidSha256(checksum)) return text(`Error: '${checksum ?? ""}' is not a valid SHA-256 hex digest (64 chars, 0-9a-f). Compute it with: sha256sum ${slug}-${version}.zip`)

      const existing = await env.DB.prepare(
        "SELECT id FROM plugin_versions WHERE slug = ? AND version = ?"
      ).bind(slug, version).first()
      if (existing) return text(`Error: Plugin '${slug}' v${version} is already registered. Use a different version or delete/replace it first.`)

      const filename = `${slug}-${version}.zip`
      const zipPath = `plugins/${slug}/${version}/${filename}`

      const object = await bucket.head(zipPath)
      if (!object) {
        return text(JSON.stringify({
          success: false,
          error: `No file found at '${zipPath}'.`,
          fix: `Step 2 cannot run before Step 1 (the file must exist in R2). Run generate_plugin_upload_link (or upload via rclone/AWS CLI for files > 95 MB), upload ${filename}, then re-run this tool.`,
        }, null, 2))
      }

      await env.DB.prepare("UPDATE plugin_versions SET is_latest = 0 WHERE slug = ?").bind(slug).run()
      await env.DB.prepare(
        `INSERT INTO plugin_versions (slug, version, changelog, zip_path, checksum, requires_chaton, is_latest, released_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      ).bind(slug, version, changelog || null, zipPath, checksum, requires_chaton || null).run()

      return text(JSON.stringify({
        success: true,
        release_type: "plugin",
        slug,
        version,
        zip_path: zipPath,
        checksum,
        file_size: object.size,
        is_latest: true,
        release_url: `${env.API_BASE_URL || "https://api.chatloka.net"}/api/plugins/token`,
        note: "Version is now live and will be suggested to clients via /api/plugins/check-updates.",
      }, null, 2))
    }
  )

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
    "generate_app_upload_link",
    {
      description: "Step 1 of releasing a new Chatloka app version from your machine/VPS: get a one-time signed URL to upload the zip. Files up to 95 MB upload through the worker with curl -T; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). This tool does NOT register the version — call publish_app_version after the upload finishes.",
      inputSchema: z.object({
        version: z.string().optional().describe("New release version (semver, e.g. 1.5.0)"),
        file_size: z.number().optional().describe("Zip file size in bytes. If known and > 95 MB you get rclone instructions instead of a signed URL so it never hits the worker's request limit"),
      }),
    },
    async ({ version, file_size }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")
      if (!env.PLUGINS_BUCKET) return text("Error: PLUGINS_BUCKET not configured")
      if (!version) return text("Error: 'version' is required")
      if (!APP_VERSION_RE.test(version)) return text(`Error: '${version}' is not a semver release (e.g. 1.4.0).`)

      const existing = await env.DB.prepare(
        "SELECT id FROM app_versions WHERE version = ?"
      ).bind(version).first()
      if (existing) return text(`Error: App version ${version} already exists. Pick a new version.`)

      const filename = `chatloka-${version}.zip`
      const zipPath = `app-releases/${version}/${filename}`
      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"

      if (file_size !== undefined && file_size > MAX_SIGNED_UPLOAD_BYTES) {
        return text(JSON.stringify({
          status: "use_rclone",
          release_type: "app",
          message: `File (${file_size} bytes) exceeds the 95 MB worker upload limit. Upload it directly to R2 with rclone or the AWS CLI (S3 multipart) instead of using the signed URL.`,
          target_bucket: R2_BUCKET_NAME,
          target_key: `${zipPath}`,
          filename,
          max_size_bytes: MAX_SIGNED_UPLOAD_BYTES,
          instructions: [
            `1. Compute the SHA-256 of the zip: sha256sum ${filename}`,
            `2. Upload straight to R2 (multipart + resumable): rclone copyto ./${filename} :s3,provider=Cloudflare:${R2_BUCKET_NAME}/${zipPath} --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `   Or with the AWS CLI: aws s3 cp ./${filename} s3://${R2_BUCKET_NAME}/${zipPath} --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `3. Verify it landed: rclone lsl :s3,provider=Cloudflare:${R2_BUCKET_NAME}/app-releases/${version}/ --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `4. Keep the SHA-256 hex string from step 1 — you MUST pass it to publish_app_version.`,
          ],
          next_step: `Call publish_app_version({ version: "${version}", checksum: "<sha256 from step 1>" }) — the checksum is REQUIRED.`,
        }, null, 2))
      }

      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 900
      const token = await signHs256(
        {
          sub: "admin-mcp",
          kind: "upload",
          target: "app",
          version,
          filename,
          zip_path: zipPath,
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const upload_url = `${baseUrl}/api/uploads/${token}`

      return text(JSON.stringify({
        status: "ready",
        release_type: "app",
        target: { version, filename, zip_path: zipPath },
        upload_url,
        method: "PUT",
        token,
        max_size_bytes: MAX_SIGNED_UPLOAD_BYTES,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: [
          `1. Compute the SHA-256 of the zip (needed below and later for publish): sha256sum ${filename}`,
          `2. Stream the file to the signed URL. Use a real sha256 hex below:`,
          `   curl -T ${filename} -H "X-Checksum-SHA256: <sha256>" '${upload_url}'`,
          `3. Expect a 2xx JSON response { success: true, file_size, checksum }. The file is now in R2 but NOT yet registered in the database.`,
          `4. If you already used the URL (or it expired after 15 min), re-run this tool for a fresh token.`,
        ],
        next_step: `Call publish_app_version({ version: "${version}", checksum: "<sha256 from step 1>" }) — the checksum is REQUIRED.`,
      }, null, 2))
    }
  )

  server.registerTool(
    "publish_app_version",
    {
      description: "Step 2 of releasing an app version. REGISTERS a release whose zip is already in R2 (uploaded via generate_app_upload_link or rclone). It does NOT upload anything; it verifies the object exists, then inserts the version row and marks it latest. Requires the SHA-256 checksum computed on the machine that has the zip (sha256sum).",
      inputSchema: z.object({
        version: z.string().describe("Release version that was uploaded (semver, e.g. 1.4.0)"),
        checksum: z.string().describe("REQUIRED. SHA-256 hex digest of the zip (run: sha256sum chatloka-<version>.zip). Used for integrity/tamper detection"),
        changelog: z.string().optional().describe("Release changelog"),
        file_size: z.number().optional().describe("Zip size in bytes (shown to clients in the update payload)"),
        min_php_version: z.string().optional().describe("Minimum PHP version required, defaults to 8.2"),
        min_chatloka_version: z.string().optional().describe("Minimum Chatloka version this release requires migrating to"),
        breaking_changes: z.string().optional().describe("JSON-encoded array of breaking-change descriptions, e.g. [\"Drops PHP 8.0 support\"]"),
      }),
    },
    async ({ version, checksum, changelog, file_size, min_php_version, min_chatloka_version, breaking_changes }) => {
      const bucket = env.PLUGINS_BUCKET
      if (!bucket) return text("Error: PLUGINS_BUCKET not configured")
      if (!APP_VERSION_RE.test(version)) return text(`Error: '${version}' is not a semver release version (e.g. 1.4.0).`)
      if (!isValidSha256(checksum)) return text(`Error: '${checksum ?? ""}' is not a valid SHA-256 hex digest (64 chars, 0-9a-f). Compute it with: sha256sum chatloka-${version}.zip`)

      const service = new AppUpdateService(env.DB)
      const existing = await service.getVersionByVersion(version)
      if (existing) return text(`Error: App version ${version} is already registered. Use a different version.`)

      const filename = `chatloka-${version}.zip`
      const zipPath = `app-releases/${version}/${filename}`

      const object = await bucket.head(zipPath)
      if (!object) {
        return text(JSON.stringify({
          success: false,
          error: `No file found at '${zipPath}'.`,
          fix: `Run generate_app_upload_link (or upload via rclone/AWS CLI for files > 95 MB), upload ${filename}, then re-run this tool.`,
        }, null, 2))
      }

      await service.createVersion({
        version,
        changelog: changelog || undefined,
        zip_path: zipPath,
        checksum,
        file_size: file_size ?? object.size,
        min_php_version: min_php_version || undefined,
        min_chatloka_version: min_chatloka_version || undefined,
        breaking_changes: breaking_changes || undefined,
        created_by: "admin-mcp",
      })

      return text(JSON.stringify({
        success: true,
        release_type: "app",
        version,
        zip_path: zipPath,
        checksum,
        file_size: file_size ?? object.size,
        min_php_version: min_php_version || "8.2",
        is_latest: true,
        note: "Version is now the latest. Clients running /api/app/check-update will be told to upgrade.",
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

  // ─── File Manager Tools (R2 internal files) ─────────────────────

  const fileManager = () => {
    if (!env.PLUGINS_BUCKET) throw new Error("PLUGINS_BUCKET not configured")
    return new FileManagerService(env.PLUGINS_BUCKET)
  }

  const SAFE_KEY_RE = /^[A-Za-z0-9._\-/ ]+$/

  function isSafeObjectKey(key: string): boolean {
    if (!key || key.length > 500) return false
    if (key.startsWith("/") || key.includes("..")) return false
    return SAFE_KEY_RE.test(key)
  }

  server.registerTool(
    "get_files",
    {
      description: "List objects in the R2 File Manager. With folder='files/' you get the internal file area; browse sub-folders by passing their path (e.g. 'files/specs/'). Returns sub-folders plus files with size, upload date, content type and SHA-256 checksum. Set search to find files by name inside the given folder.",
      inputSchema: z.object({
        folder: z.string().optional().describe("Folder path to list (e.g. '' for root, 'files/' for internal files, 'files/specs/'). Defaults to ''"),
        search: z.string().optional().describe("Search term — matches file names inside the folder (recursive)"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        limit: z.number().optional().describe("Max entries, defaults to 200, max 1000"),
      }),
    },
    async ({ folder, search, cursor, limit }) => {
      try {
        const fm = fileManager()
        const result = await fm.list(folder || "", { search, cursor, limit: limit || 200 })
        return text(JSON.stringify({
          folder: folder || "",
          folders: result.folders.map((f) => f.key),
          files: result.files,
          has_more: result.truncated,
          next_cursor: result.cursor,
        }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to list files" }, null, 2))
      }
    }
  )

  server.registerTool(
    "create_folder",
    {
      description: "Create a folder in the R2 File Manager (zero-byte placeholder object, standard R2 convention). Pass the full path, e.g. 'files/specs/2025' or 'files/custom-solutions/buyer-x'. Nested folders are created implicitly once a file lands inside them, but this keeps the folder visible in listings.",
      inputSchema: z.object({
        path: z.string().describe("Folder path to create (e.g. files/specs/2025)"),
      }),
    },
    async ({ path }) => {
      const raw = (path || "").trim()
      if (!isSafeObjectKey(raw)) return text(`Error: '${raw}' is not a valid folder path`)
      try {
        const key = await fileManager().createFolder(raw)
        return text(JSON.stringify({ success: true, key, message: `Folder '${key}' created` }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to create folder" }, null, 2))
      }
    }
  )

  server.registerTool(
    "generate_file_upload_link",
    {
      description: "Upload a file to the R2 File Manager from your machine/VPS. Returns a one-time signed PUT URL (15 min, single-use) plus a curl command. Files up to 95 MB stream through the worker; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). Unlike release uploads there is NO publish step — after the upload the file is immediately live and visible in get_files / the admin File Manager.",
      inputSchema: z.object({
        folder: z.string().optional().describe("Destination folder, defaults to 'files/' (internal file area). Use e.g. 'files/specs/' or 'files/custom-solutions/buyer-x/'"),
        filename: z.string().describe("File name, e.g. spec-v2.pdf or chatloka-source.tar.gz (no slashes)"),
        file_size: z.number().optional().describe("File size in bytes. If known and > 95 MB you get rclone instructions instead of a signed URL"),
        content_type: z.string().optional().describe("Content type to store (e.g. application/pdf). Auto-detected from common extensions when omitted"),
      }),
    },
    async ({ folder, filename, file_size, content_type }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")
      const name = (filename || "").trim()
      if (!name || name.includes("/") || name.includes("\\") || name.length > 200) {
        return text(`Error: '${filename ?? ""}' is not a valid file name (no slashes)`)
      }
      const folderPath = (folder || "files/").trim().replace(/^\/+|\/+$/g, "") + "/"
      const key = `${folderPath}${name}`
      if (!isSafeObjectKey(key)) return text(`Error: target key '${key}' is not valid`)

      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"
      const maxSize = MAX_SIGNED_UPLOAD_BYTES

      if (file_size !== undefined && file_size > maxSize) {
        return text(JSON.stringify({
          status: "use_rclone",
          message: `File (${file_size} bytes) exceeds the 95 MB worker upload limit. Upload it directly to R2 with rclone or the AWS CLI (S3 multipart) instead of using the signed URL.`,
          target_bucket: R2_BUCKET_NAME,
          target_key: key,
          filename: name,
          max_size_bytes: maxSize,
          instructions: [
            `1. (Optional) Compute the SHA-256 if you want integrity verification: sha256sum ${name}`,
            `2. Upload straight to R2 (multipart + resumable): rclone copyto ./${name} :s3,provider=Cloudflare:${R2_BUCKET_NAME}/${key} --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `   Or with the AWS CLI: aws s3 cp ./${name} s3://${R2_BUCKET_NAME}/${key} --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
            `3. Verify it landed: get_files({ folder: "${folderPath}" }) or rclone lsl :s3,provider=Cloudflare:${R2_BUCKET_NAME}/${folderPath} --s3-endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`,
          ],
          next_step: "No publish step needed — the file is live immediately. Call get_files to confirm.",
        }, null, 2))
      }

      const ext = name.split(".").pop()?.toLowerCase() || ""
      const autoType: Record<string, string> = {
        pdf: "application/pdf", zip: "application/zip", json: "application/json",
        md: "text/markdown", txt: "text/plain", csv: "text/csv", html: "text/html",
        css: "text/css", js: "application/javascript", php: "text/x-php", xml: "application/xml",
      }

      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 900
      const token = await signHs256(
        {
          sub: "admin-mcp",
          kind: "upload",
          target: "file",
          zip_path: key,
          filename: name,
          content_type: content_type || autoType[ext] || "application/octet-stream",
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const upload_url = `${baseUrl}/api/uploads/${token}`

      return text(JSON.stringify({
        status: "ready",
        target: { key, filename: name },
        upload_url,
        method: "PUT",
        token,
        max_size_bytes: maxSize,
        expires_at: new Date(exp * 1000).toISOString(),
        instructions: [
          `1. (Optional) Compute the SHA-256 of the file: sha256sum ${name}`,
          `2. Stream the file to the signed URL (add -H "X-Checksum-SHA256: <sha256>" to have R2 validate integrity):`,
          `   curl -T ${name} '${upload_url}'`,
          `3. Expect a 2xx JSON response { success: true, file_size, checksum }. The file is now live in R2 — no publish step needed.`,
          `4. If you already used the URL (or it expired after 15 min), re-run this tool for a fresh token.`,
        ],
        next_step: `Call get_files({ folder: "${folderPath}" }) to confirm the file is listed.`,
      }, null, 2))
    }
  )

  server.registerTool(
    "generate_file_download_link",
    {
      description: "Generate a one-time signed download URL for a file in the R2 File Manager. The URL works with plain curl (no headers) and expires after 1 hour or first use. The file is streamed with its stored content type and checksum headers.",
      inputSchema: z.object({
        key: z.string().describe("Full object key of the file, e.g. files/specs/spec-v2.pdf (must be a file, not a folder)"),
      }),
    },
    async ({ key }) => {
      if (!env.DOWNLOAD_TOKEN_SECRET) return text("Error: DOWNLOAD_TOKEN_SECRET not configured")
      if (!isSafeObjectKey(key || "")) return text(`Error: '${key ?? ""}' is not a valid object key`)
      if ((key || "").endsWith("/")) return text(`Error: '${key}' is a folder — pick a file inside it`)
      try {
        const fm = fileManager()
        const obj = await fm.head(key)
        if (!obj) return text(`Error: no file found at '${key}'`)
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to check file" }, null, 2))
      }

      const jti = crypto.randomUUID()
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = await signHs256(
        {
          sub: "admin-mcp",
          kind: "file-download",
          key,
          jti,
          iss: "api.chatloka.net",
          exp,
        },
        env.DOWNLOAD_TOKEN_SECRET,
      )

      const baseUrl = env.API_BASE_URL || "https://api.chatloka.net"
      const download_url = `${baseUrl}/api/files/download/${token}`

      return text(JSON.stringify({
        download_url,
        token,
        key,
        expires_at: new Date(exp * 1000).toISOString(),
        single_use: true,
        instructions: `Download with curl: curl -OJ "${download_url}"`,
      }, null, 2))
    }
  )

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file or an entire folder from the R2 File Manager (and the rest of the bucket). Pass an exact file key (e.g. 'files/specs/old.pdf') or a folder path ending with '/' (e.g. 'files/custom-solutions/buyer-x/') to delete it recursively. Returns how many objects were removed. Irreversible.",
      inputSchema: z.object({
        key: z.string().describe("Object key to delete. Ends with '/' to delete a whole folder recursively"),
      }),
    },
    async ({ key }) => {
      const raw = (key || "").trim()
      if (!isSafeObjectKey(raw)) return text(`Error: '${raw}' is not a valid object key`)
      try {
        const result = await fileManager().deletePath(raw)
        return text(JSON.stringify({
          success: true,
          deleted_objects: result.deleted,
          type: result.type,
          target: raw,
          note: result.deleted === 0 ? "Nothing was found at that key." : undefined,
        }, null, 2))
      } catch (e: any) {
        return text(JSON.stringify({ success: false, error: e?.message || "Failed to delete" }, null, 2))
      }
    }
  )

  return server
}
