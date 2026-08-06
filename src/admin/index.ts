import { Hono } from "hono";
import { createAuth } from "../auth";
import { AppUpdateService } from "../services/appUpdate";
import { TicketService, type Ticket } from "../services/ticket";
import { NotificationService } from "../services/notification";
import { ResendService } from "../services/resend";
import { ContactService } from "../services/contact";
import { EnvatoService } from "../services/envato";
import { TelegramBotService } from "../services/telegram";
import { broadcastRealtime } from "../realtime/hub";
import type { CloudflareBindings } from "../types";

export interface AdminVariables {
  session: {
    user: {
      id: string;
      name: string;
      email: string;
    };
    session: {
      id: string;
      expiresAt: Date;
    };
  };
}

export const adminRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: AdminVariables }>();

// Session middleware - protect all /manage/api/* routes
adminRoutes.use("*", async (c, next) => {
  const auth = createAuth(c.env);

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("session", session as AdminVariables["session"]);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

// Stats endpoint
adminRoutes.get("/stats", async (c) => {
  const db = c.env.DB;

  const [licensesResult, pluginsResult, tamperResult, recentLicenses, latestTamper, apiStats, licenseTypesResult] = await db.batch([
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'deactivated' THEN 1 ELSE 0 END) as deactivated, SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended FROM licenses"),
    db.prepare("SELECT COUNT(DISTINCT slug) as total, COUNT(*) as totalVersions FROM plugin_versions"),
    db.prepare("SELECT COUNT(*) as total FROM tamper_logs WHERE created_at > datetime('now', '-24 hours')"),
    db.prepare("SELECT id, purchase_code, domain, status, buyer_email, last_validated_at, created_at FROM licenses ORDER BY created_at DESC LIMIT 5"),
    db.prepare("SELECT id, domain, failures, ip, created_at FROM tamper_logs ORDER BY created_at DESC LIMIT 5"),
    db.prepare(`SELECT COUNT(*) as total_24h, SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success, SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_error, SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error, AVG(response_time_ms) as avg_response FROM api_logs WHERE created_at > datetime('now', '-24 hours')`),
    db.prepare("SELECT license_type, COUNT(*) as count FROM licenses GROUP BY license_type"),
  ]);

  const licenses = licensesResult.results?.[0] as { total: number; active: number; deactivated: number; suspended: number } | undefined;
  const plugins = pluginsResult.results?.[0] as { total: number; totalVersions: number } | undefined;
  const tamper = tamperResult.results?.[0] as { total: number } | undefined;
  const api = apiStats.results?.[0] as { total_24h: number; success: number; client_error: number; server_error: number; avg_response: number } | undefined;
  const licenseTypes = (licenseTypesResult.results || []) as { license_type: string; count: number }[];
  const licenseTypeStats = licenseTypes.reduce<Record<string, number>>((acc, row) => {
    acc[row.license_type] = row.count;
    return acc;
  }, {});

  return c.json({
    totalLicenses: licenses?.total || 0,
    activeLicenses: licenses?.active || 0,
    deactivatedLicenses: licenses?.deactivated || 0,
    suspendedLicenses: licenses?.suspended || 0,
    totalPlugins: plugins?.total || 0,
    totalPluginVersions: plugins?.totalVersions || 0,
    recentTamperAttempts: tamper?.total || 0,
    licenseTypes: {
      regular: licenseTypeStats.regular || 0,
      extended: licenseTypeStats.extended || 0,
    },
    apiStats: {
      total24h: api?.total_24h || 0,
      success: api?.success || 0,
      clientError: api?.client_error || 0,
      serverError: api?.server_error || 0,
      avgResponse: api?.avg_response || 0,
    },
    recentLicenses: recentLicenses.results || [],
    latestTamper: latestTamper.results || [],
  });
});

// Licenses endpoints
adminRoutes.post("/licenses", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    purchase_code: string;
    license_type?: string;
    domain: string;
    buyer_email?: string;
    buyer_name?: string;
  }>();

  if (!body.purchase_code || !body.domain) {
    return c.json({ error: "purchase_code and domain are required" }, 400);
  }

  const now = new Date().toISOString();
  const licenseType = body.license_type || "regular";

  if (!["regular", "extended"].includes(licenseType)) {
    return c.json({ error: "Invalid license_type" }, 400);
  }

  await db.prepare(
    `INSERT INTO licenses (purchase_code, license_type, domain, buyer_email, buyer_name, activated_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  )
    .bind(
      body.purchase_code,
      licenseType,
      body.domain,
      body.buyer_email || null,
      body.buyer_name || null,
      now,
      now,
      now
    )
    .run();

  return c.json({ success: true }, 201);
});

adminRoutes.get("/licenses", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare("SELECT * FROM licenses ORDER BY created_at DESC").all();
  return c.json({ licenses: result.results });
});

adminRoutes.get("/licenses/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const result = await db.prepare("SELECT * FROM licenses WHERE id = ?").bind(id).first();
  if (!result) return c.json({ error: "License not found" }, 404);
  return c.json({ license: result });
});

adminRoutes.put("/licenses/:id/status", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: string }>();

  if (!["active", "deactivated", "suspended"].includes(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  await db.prepare("UPDATE licenses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, id)
    .run();

  return c.json({ success: true });
});

adminRoutes.put("/licenses/:id/domain", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { domain } = await c.req.json<{ domain: string }>();

  if (!domain || typeof domain !== "string") {
    return c.json({ error: "Invalid domain" }, 400);
  }

  // Get current domain for history
  const license = await db.prepare("SELECT domain FROM licenses WHERE id = ?").bind(id).first() as { domain: string } | undefined;

  if (license) {
    // Log domain change
    await db.prepare(
      "INSERT INTO domain_history (license_id, old_domain, new_domain) VALUES (?, ?, ?)"
    ).bind(id, license.domain, domain).run();
  }

  await db.prepare("UPDATE licenses SET domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(domain, id)
    .run();

  return c.json({ success: true });
});

// Plugins endpoints
adminRoutes.get("/plugins", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(
    "SELECT * FROM plugin_versions ORDER BY released_at DESC"
  ).all();
  return c.json({ plugins: result.results });
});

adminRoutes.get("/plugins/:slug", async (c) => {
  const db = c.env.DB;
  const slug = c.req.param("slug");
  const result = await db.prepare(
    "SELECT * FROM plugin_versions WHERE slug = ? ORDER BY released_at DESC"
  ).bind(slug).all();
  return c.json({ slug, versions: result.results });
});

// Upload plugin
adminRoutes.post("/plugins/upload", async (c) => {
  const db = c.env.DB;
  const bucket = c.env.PLUGINS_BUCKET;

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string | null;
  const version = formData.get("version") as string | null;
  const changelog = formData.get("changelog") as string | null;

  if (!file || !slug || !version) {
    return c.json({ error: "Missing required fields: file, slug, version" }, 400);
  }

  if (!file.name.endsWith(".zip")) {
    return c.json({ error: "File must be a .zip file" }, 400);
  }

  // Calculate checksum
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const checksum = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Upload to R2
  const zipPath = `plugins/${slug}/${version}/${slug}-${version}.zip`;
  await bucket.put(zipPath, file);

  // Mark previous versions as not latest
  await db.prepare("UPDATE plugin_versions SET is_latest = 0 WHERE slug = ?")
    .bind(slug)
    .run();

  // Insert new version
  await db.prepare(
    `INSERT INTO plugin_versions (slug, version, changelog, zip_path, checksum, is_latest, released_at)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
  ).bind(slug, version, changelog || null, zipPath, checksum).run();

  return c.json({ success: true, zipPath, checksum });
});

// Logs endpoints with pagination, search, and filtering
adminRoutes.get("/logs", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = (page - 1) * limit;
  const search = c.req.query("search") || "";
  const endpoint = c.req.query("endpoint") || "";
  const status = c.req.query("status") || "";
  const sort = c.req.query("sort") || "newest";

  let query = "SELECT * FROM api_logs WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as total FROM api_logs WHERE 1=1";
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (search) {
    const searchClause = " AND (endpoint LIKE ? OR ip_address LIKE ? OR purchase_code LIKE ? OR user_agent LIKE ?)";
    query += searchClause;
    countQuery += searchClause;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
    countParams.push(searchParam, searchParam, searchParam, searchParam);
  }

  if (endpoint) {
    const endpointClause = " AND endpoint = ?";
    query += endpointClause;
    countQuery += endpointClause;
    params.push(endpoint);
    countParams.push(endpoint);
  }

  if (status) {
    const statusClause = " AND status_code = ?";
    query += statusClause;
    countQuery += statusClause;
    params.push(parseInt(status, 10));
    countParams.push(parseInt(status, 10));
  }

  const orderClause = sort === "oldest" ? "ASC" : "DESC";
  query += ` ORDER BY created_at ${orderClause} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [logsResult, countResult] = await db.batch([
    db.prepare(query).bind(...params),
    db.prepare(countQuery).bind(...countParams),
  ]);

  const total = (countResult.results?.[0] as { total: number })?.total || 0;

  return c.json({
    logs: logsResult.results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

adminRoutes.get("/logs/endpoints", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(
    "SELECT DISTINCT endpoint, COUNT(*) as count FROM api_logs GROUP BY endpoint ORDER BY count DESC"
  ).all();
  return c.json({ endpoints: result.results });
});

adminRoutes.get("/logs/stats", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(`
    SELECT 
      COUNT(*) as total_requests,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_error_count,
      SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error_count,
      AVG(response_time_ms) as avg_response_time,
      MAX(response_time_ms) as max_response_time
    FROM api_logs
    WHERE created_at > datetime('now', '-24 hours')
  `).first();
  return c.json({ stats: result });
});

adminRoutes.get("/logs/tamper", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = (page - 1) * limit;
  const search = c.req.query("search") || "";
  const sort = c.req.query("sort") || "newest";

  let whereClause = "";
  const bindings: (string | number)[] = [];
  if (search) {
    whereClause = "WHERE domain LIKE ? OR ip LIKE ?";
    bindings.push(`%${search}%`, `%${search}%`);
  }

  const orderClause = sort === "oldest" ? "ASC" : "DESC";

  const countStmt = `SELECT COUNT(*) as total FROM tamper_logs ${whereClause}`;
  const dataStmt = `SELECT * FROM tamper_logs ${whereClause} ORDER BY created_at ${orderClause} LIMIT ? OFFSET ?`;

  const [logsResult, countResult] = await db.batch([
    db.prepare(dataStmt).bind(...bindings, limit, offset),
    db.prepare(countStmt).bind(...bindings),
  ]);

  const total = (countResult.results?.[0] as { total: number })?.total || 0;

  return c.json({
    logs: logsResult.results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Plugin download endpoint (admin - generates a signed download URL)
adminRoutes.get("/plugins/:slug/download", async (c) => {
  const db = c.env.DB;
  const bucket = c.env.PLUGINS_BUCKET;
  const slug = c.req.param("slug");
  const version = c.req.query("version");

  let plugin;
  if (version) {
    plugin = await db.prepare(
      "SELECT * FROM plugin_versions WHERE slug = ? AND version = ?"
    ).bind(slug, version).first() as {
      id: number;
      slug: string;
      version: string;
      zip_path: string;
      checksum: string;
    } | undefined;
  } else {
    plugin = await db.prepare(
      "SELECT * FROM plugin_versions WHERE slug = ? AND is_latest = 1"
    ).bind(slug).first() as {
      id: number;
      slug: string;
      version: string;
      zip_path: string;
      checksum: string;
    } | undefined;
  }

  if (!plugin) {
    return c.json({ error: "Plugin not found" }, 404);
  }

  const object = await bucket.get(plugin.zip_path);
  if (!object || !object.body) {
    return c.json({ error: "Plugin file not found in storage" }, 404);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-${plugin.version}.zip"`,
      "X-Checksum-SHA256": plugin.checksum,
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
});

// ============================================
// App Versions (Auto-Update System)
// ============================================

// List all app versions with pagination
adminRoutes.get("/app-versions", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const search = c.req.query("search") || "";

  const appUpdateService = new AppUpdateService(db);
  const { versions, total } = await appUpdateService.getVersionsPaginated(page, limit, search || undefined);

  return c.json({
    versions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single app version detail
adminRoutes.get("/app-versions/:version", async (c) => {
  const db = c.env.DB;
  const version = c.req.param("version");

  const appUpdateService = new AppUpdateService(db);
  const appVersion = await appUpdateService.getVersionByVersion(version);

  if (!appVersion) {
    return c.json({ error: "Version not found" }, 404);
  }

  return c.json({ version: appVersion });
});

// Upload new app version
adminRoutes.post("/app-versions/upload", async (c) => {
  const db = c.env.DB;
  const bucket = c.env.PLUGINS_BUCKET;
  const session = c.get("session");

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const version = formData.get("version") as string | null;
  const changelog = formData.get("changelog") as string | null;
  const breakingChanges = formData.get("breaking_changes") as string | null;
  const minPhpVersion = formData.get("min_php_version") as string | null;

  if (!file || !version) {
    return c.json({ error: "Missing required fields: file, version" }, 400);
  }

  if (!file.name.endsWith(".zip")) {
    return c.json({ error: "File must be a .zip file" }, 400);
  }

  // Validate semver format
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return c.json({ error: "Version must be in semver format (e.g. 1.3.0)" }, 400);
  }

  const appUpdateService = new AppUpdateService(db);

  // Check if version already exists
  const existing = await appUpdateService.getVersionByVersion(version);
  if (existing) {
    return c.json({ error: "Version already exists" }, 409);
  }

  // Calculate checksum
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const checksum = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Upload to R2
  const zipPath = `app-releases/${version}/chatloka-${version}.zip`;
  await bucket.put(zipPath, file);

  // Insert into database
  await appUpdateService.createVersion({
    version,
    changelog: changelog || undefined,
    zip_path: zipPath,
    checksum,
    file_size: file.size,
    min_php_version: minPhpVersion || undefined,
    breaking_changes: breakingChanges || undefined,
    created_by: session?.user?.id || undefined,
  });

  return c.json({
    success: true,
    version,
    zip_path: zipPath,
    checksum,
    file_size: file.size,
  });
});

// Delete an app version (cannot delete latest)
adminRoutes.delete("/app-versions/:version", async (c) => {
  const db = c.env.DB;
  const version = c.req.param("version");

  const appUpdateService = new AppUpdateService(db);
  const deleted = await appUpdateService.deleteVersion(version);

  if (!deleted) {
    return c.json({ error: "Cannot delete the latest version" }, 400);
  }

  return c.json({ success: true });
});

// Get app update logs
adminRoutes.get("/app-update-logs", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const search = c.req.query("search") || "";

  const appUpdateService = new AppUpdateService(db);
  const { logs, total } = await appUpdateService.getUpdateLogs(page, limit, search || undefined);

  return c.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ============================================
// Contacts (people who ever emailed support)
// ============================================

// List contacts with Lead/Customer badge info
adminRoutes.get("/contacts", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const search = c.req.query("search") || "";
  const type = c.req.query("type") || "";

  const contactService = new ContactService(db);
  const { contacts, total } = await contactService.getContactsPaginated(page, limit, {
    search: search || undefined,
    type: type === "lead" || type === "customer" ? type : undefined,
  });

  return c.json({
    contacts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Verify a purchase code against Envato (auto-fill for the add-purchase dialog)
adminRoutes.post("/contacts/verify-purchase", async (c) => {
  const body = await c.req.json<{ purchase_code?: string }>();
  const purchaseCode = (body.purchase_code || "").trim();
  if (!purchaseCode) {
    return c.json({ error: "purchase_code is required" }, 400);
  }

  const envato = new EnvatoService(c.env);
  const result = await envato.verifyPurchaseCode(purchaseCode);

  if (!result.valid || !result.purchase) {
    return c.json({ error: result.error || "Invalid purchase code" }, 400);
  }

  return c.json({
    purchase: {
      purchase_code: purchaseCode,
      license_type: result.purchase.license,
      item_name: result.purchase.item?.name || null,
      purchase_date: result.purchase.sold_at,
      support_until: result.purchase.supported_until || null,
      buyer: result.purchase.buyer || null,
    },
  });
});

// Contact detail: contact + purchases + their tickets
adminRoutes.get("/contacts/:id", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid contact id" }, 400);
  }

  const contactService = new ContactService(db);
  const contact = await contactService.getContactDetail(id);
  if (!contact) {
    return c.json({ error: "Contact not found" }, 404);
  }

  return c.json({ contact });
});

// Add a purchase code to a contact (promotes lead -> customer)
adminRoutes.post("/contacts/:id/purchases", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{
    purchase_code?: string;
    license_type?: string;
    item_name?: string | null;
    purchase_date?: string | null;
    support_until?: string | null;
    support_term_months?: number | null;
    source?: string;
  }>();

  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid contact id" }, 400);
  }
  if (!body.purchase_code?.trim()) {
    return c.json({ error: "purchase_code is required" }, 400);
  }

  const contactService = new ContactService(db);
  try {
    const purchase = await contactService.addPurchase(id, {
      purchase_code: body.purchase_code,
      license_type: (body.license_type as "regular" | "extended") || "regular",
      item_name: body.item_name ?? null,
      purchase_date: body.purchase_date || null,
      support_until: body.support_until || null,
      support_term_months: body.support_term_months || null,
      source: (body.source === "envato" ? "envato" : "manual") as "envato" | "manual",
    });
    return c.json({ purchase, contactType: "customer" }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to add purchase" }, 400);
  }
});

// Update a purchase (license type, support period, dates)
adminRoutes.patch("/contacts/:id/purchases/:purchaseId", async (c) => {
  const db = c.env.DB;
  const purchaseId = parseInt(c.req.param("purchaseId"), 10);
  const body = await c.req.json<{
    license_type?: string;
    item_name?: string | null;
    purchase_date?: string | null;
    support_until?: string | null;
    support_term_months?: number | null;
  }>();

  if (Number.isNaN(purchaseId)) {
    return c.json({ error: "Invalid purchase id" }, 400);
  }

  const contactService = new ContactService(db);
  try {
    const purchase = await contactService.updatePurchase(purchaseId, {
      license_type: body.license_type as "regular" | "extended" | undefined,
      item_name: body.item_name,
      purchase_date: body.purchase_date,
      support_until: body.support_until,
      support_term_months: body.support_term_months,
    });
    if (!purchase) {
      return c.json({ error: "Purchase not found" }, 404);
    }
    return c.json({ purchase });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to update purchase" }, 400);
  }
});

// Remove a purchase code (reverts contact to lead if no purchases remain)
adminRoutes.delete("/contacts/:id/purchases/:purchaseId", async (c) => {
  const db = c.env.DB;
  const purchaseId = parseInt(c.req.param("purchaseId"), 10);
  if (Number.isNaN(purchaseId)) {
    return c.json({ error: "Invalid purchase id" }, 400);
  }

  const contactService = new ContactService(db);
  const result = await contactService.deletePurchase(purchaseId);
  if (!result.purchaseDeleted) {
    return c.json({ error: "Purchase not found" }, 404);
  }
  return c.json({ success: true, contactType: result.contactType });
});

// Update contact name
adminRoutes.patch("/contacts/:id", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ name?: string; notes?: string }>();

  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid contact id" }, 400);
  }

  const contactService = new ContactService(db);
  if (body.name !== undefined) {
    await contactService.updateContactName(id, body.name);
  }
  if (body.notes !== undefined) {
    await contactService.updateContactNotes(id, body.notes);
  }
  return c.json({ success: true });
});

// ============================================
// Ticket Support System
// ============================================

// List tickets
adminRoutes.get("/tickets", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const status = c.req.query("status") || "all";
  const search = c.req.query("search") || "";
  const sort = c.req.query("sort") || "newest";

  const ticketService = new TicketService(db);
  const { tickets, total } = await ticketService.getTicketsPaginated(page, limit, {
    status: status !== "all" ? status : undefined,
    search: search || undefined,
    sort,
  });

  return c.json({
    tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get ticket stats
adminRoutes.get("/tickets/stats", async (c) => {
  const db = c.env.DB;
  const ticketService = new TicketService(db);
  const stats = await ticketService.getTicketStats();
  return c.json({ stats });
});

// Get ticket analytics (WIB timezone)
adminRoutes.get("/tickets/analytics", async (c) => {
  const db = c.env.DB;
  const ticketService = new TicketService(db);
  const analytics = await ticketService.getAnalytics();
  return c.json({ analytics });
});

// Get unread ticket count + list
adminRoutes.get("/tickets/unread", async (c) => {
  const db = c.env.DB;
  const ticketService = new TicketService(db);
  const count = await ticketService.getUnreadCount();
  const tickets = await ticketService.getUnreadTickets();
  return c.json({ count, tickets: tickets.slice(0, 10) });
});

// Mark ticket as seen by admin
adminRoutes.post("/tickets/:ticketNumber/read", async (c) => {
  const db = c.env.DB;
  const ticketNumber = c.req.param("ticketNumber");

  const ticketService = new TicketService(db);
  const ticket = await ticketService.getTicketByNumber(ticketNumber);

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  await ticketService.markTicketSeen(ticket.id);
  const count = await new NotificationService(db).getUnreadCount();

  return c.json({ success: true, unreadCount: count });
});

// Get ticket detail
adminRoutes.get("/tickets/:ticketNumber", async (c) => {
  const db = c.env.DB;
  const ticketNumber = c.req.param("ticketNumber");

  const ticketService = new TicketService(db);
  const ticket = await ticketService.getTicketByNumber(ticketNumber);

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  const messages = await ticketService.getTicketMessages(ticket.id);

  // Get attachments for each message
  const messagesWithAttachments = await Promise.all(
    messages.map(async (msg) => {
      const attachments = await ticketService.getMessageAttachments(msg.id);
      return { ...msg, attachments };
    })
  );

  // Participants + merge context (so the UI can show who gets CC'd and banners)
  const participants = await ticketService.getParticipants(ticket.id);
  const mergedIntoTicket = await ticketService.getMergedIntoTicket(ticket.id);
  const mergedSources = await ticketService.getMergedSources(ticket.id);

  // Contact/badge info for the ticket owner (Lead vs Customer + support status)
  let contact = null;
  if (ticket.contact_id) {
    const contactService = new ContactService(db);
    contact = await contactService.getContactDetail(ticket.contact_id);
  } else if (ticket.from_email) {
    const contactService = new ContactService(db);
    const byEmail = await contactService.getContactByEmail(ticket.from_email);
    if (byEmail) contact = await contactService.getContactDetail(byEmail.id);
  }

  return c.json({
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
  });
});

// Merge tickets: move source tickets into a target ticket (by number) or into
// a freshly created ticket. Sources are marked 'merged' and their owners are
// added as participants so replies are CC'd to everyone.
adminRoutes.post("/tickets/merge", async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<{
    target_ticket_number?: string;
    source_ticket_numbers: string[];
    new_ticket_subject?: string;
  }>();

  const sourceNumbers = (body.source_ticket_numbers || [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (sourceNumbers.length === 0) {
    return c.json({ error: { message: "Select at least one ticket to merge" } }, 400);
  }

  const ticketService = new TicketService(db);

  // Resolve target: existing ticket number OR create a new container ticket.
  let target: Ticket;
  const wantedTarget = body.target_ticket_number?.trim();
  if (wantedTarget) {
    const found = await ticketService.getTicketByNumber(wantedTarget);
    if (!found) {
      return c.json({ error: { message: "Target ticket not found" } }, 404);
    }
    if (found.status === "merged") {
      return c.json({ error: { message: "Cannot merge into an already-merged ticket" } }, 400);
    }
    target = found;
  } else {
    // New container ticket seeded from the first source ticket.
    const firstSource = await ticketService.getTicketByNumber(sourceNumbers[0]);
    if (!firstSource) {
      return c.json({ error: { message: "Source ticket not found" } }, 404);
    }
    const ticketNumber = await ticketService.generateTicketNumber();
    target = await ticketService.createTicket({
      ticket_number: ticketNumber,
      from_email: firstSource.from_email,
      subject: body.new_ticket_subject?.trim() || firstSource.subject,
    });
  }

  // Resolve source tickets (must exist and not already be merged / the target)
  const sourceTicketIds: number[] = [];
  for (const num of sourceNumbers) {
    const t = await ticketService.getTicketByNumber(num);
    if (!t) {
      return c.json({ error: { message: `Ticket ${num} not found` } }, 404);
    }
    sourceTicketIds.push(t.id);
  }

  try {
    const { movedMessages, mergedCount } = await ticketService.mergeTickets(target.id, sourceTicketIds);

    // Audit trail: automated message in the target noting each merged ticket
    for (const num of sourceNumbers) {
      const source = await ticketService.getTicketByNumber(num);
      if (!source) continue;
      const noteHtml = `<p>This ticket was merged into <strong>${target.ticket_number}</strong> — <code>${source.ticket_number}</code> (${source.from_email}) was combined into this conversation.</p>`;
      await ticketService.createMessage({
        ticket_id: target.id,
        direction: "outbound",
        from_email: "system",
        to_email: target.from_email,
        subject: `Merged ticket ${source.ticket_number}`,
        body_html: noteHtml,
        body_text: `Merged ticket ${source.ticket_number} into ${target.ticket_number}.`,
        is_automated: 1,
      });
    }

    return c.json({
      success: true,
      target_ticket_number: target.ticket_number,
      merged_count: mergedCount,
      moved_messages: movedMessages,
    });
  } catch (err) {
    return c.json(
      { error: { message: err instanceof Error ? err.message : "Merge failed" } },
      400
    );
  }
});

// Reply to ticket (multipart: body_html, body_text, files[])
adminRoutes.post("/tickets/:ticketNumber/reply", async (c) => {
  const db = c.env.DB;
  const env = c.env;
  const bucket = c.env.PLUGINS_BUCKET;
  const ticketNumber = c.req.param("ticketNumber");

  const ticketService = new TicketService(db);
  const ticket = await ticketService.getTicketByNumber(ticketNumber);

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  // Parse multipart form. Note: adminRoutes already passed through session middleware.
  let bodyHtml = "";
  let bodyText: string | undefined;
  let files: File[] = [];

  const contentType = c.req.header("Content-Type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    bodyHtml = (form.get("body_html") as string) || "";
    bodyText = (form.get("body_text") as string) || undefined;
    const fileEntries = form.getAll("files");
    files = fileEntries.filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  } else {
    const body = await c.req.json<{
      body_html: string;
      body_text?: string;
      attachments?: Array<{ filename: string; content: string; content_type?: string }>;
    }>();
    bodyHtml = body.body_html || "";
    bodyText = body.body_text;
    // Legacy JSON attachment support: base64 → File
    if (body.attachments?.length) {
      for (const a of body.attachments) {
        try {
          const bin = atob(a.content);
          const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
          files.push(new File([bytes], a.filename, { type: a.content_type || "application/octet-stream" }));
        } catch {
          // skip malformed legacy attachment
        }
      }
    }
  }

  if (!bodyHtml.trim()) {
    return c.json({ error: "body_html is required" }, 400);
  }

  // Enforce a reasonable size per file (Resend limit is 10MB per attachment)
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return c.json({ error: `File "${f.name}" exceeds 10MB limit` }, 400);
    }
  }

  // Read file contents → base64 for Resend + ArrayBuffer for R2
  const uploadedAttachments: Array<{
    filename: string;
    content_type: string;
    file_size: number;
    r2_path: string;
    resendContent: string;
  }> = [];

  for (const f of files) {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
    }
    const resendContent = btoa(binary);
    uploadedAttachments.push({
      filename: f.name,
      content_type: f.type || "application/octet-stream",
      file_size: f.size,
      r2_path: "",
      resendContent,
    });
  }

  // Get all references for threading
  const allReferences = await ticketService.getAllReferences(ticket.id);
  const messages = await ticketService.getTicketMessages(ticket.id);
  const lastMessage = messages[messages.length - 1];

  // Auto-generated tracking footer (kept small, mono-style)
  const sentAt = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const footerHtml = `
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
        Ticket ID: ${ticket.ticket_number}
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:2px;">
        Sent at: ${sentAt}
      </div>
    </div>`;
  bodyHtml = `${bodyHtml}\n${footerHtml}`;
  if (bodyText) {
    bodyText = `${bodyText}\n\n--\nTicket ID: ${ticket.ticket_number}\nSent at: ${sentAt}`;
  }

  // Build headers for threading
  const headers: Record<string, string> = {};
  if (lastMessage?.message_id) {
    headers["In-Reply-To"] = lastMessage.message_id;
    if (allReferences.length > 0) {
      headers["References"] = [...allReferences, lastMessage.message_id].join(" ");
    }
  }

  // Send email via Resend (with attachments as base64)
  // To primary owner + CC all participants (merged tickets broadcast to everyone)
  const resendService = new ResendService(env);
  const fromName = env.TICKET_FROM_NAME || "Chatloka Support";
  const fromEmail = env.TICKET_FROM_EMAIL || "contact@support.chatloka.net";
  const from = `${fromName} <${fromEmail}>`;
  const participants = (await ticketService.getParticipants(ticket.id)).filter((email) => {
    const normalized = email.toLowerCase();
    // Never CC the support inbox or the ticket owner themselves: CC'ing the
    // support inbox wastes outbound quota and echoes the reply back as a
    // webhook event, and CC'ing the owner just re-sends what they wrote.
    return normalized !== ticket.from_email.toLowerCase() && normalized !== fromEmail.toLowerCase();
  });
  const result = await resendService.sendEmail({
    from,
    to: [ticket.from_email],
    cc: participants.length > 0 ? participants : undefined,
    subject: `Re: [${ticket.ticket_number}] ${ticket.subject}`,
    html: bodyHtml,
    text: bodyText,
    headers,
    attachments: uploadedAttachments.map((a) => ({
      filename: a.filename,
      content: a.resendContent,
      content_type: a.content_type,
    })),
  });

  // Fetch the real Message-ID header of the sent email so that
  // future customer replies (which reference it in In-Reply-To) map back to this ticket.
  let sentMessageId = result.id;
  try {
    const sent = await resendService.getSentEmail(result.id);
    if (sent?.message_id) sentMessageId = sent.message_id;
  } catch (sentErr) {
    console.error("[Ticket Reply] Failed to fetch sent email Message-ID:", sentErr);
  }

  // Store outbound message
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
    has_attachments: uploadedAttachments.length > 0 ? 1 : 0,
  });

  // Upload attachments to R2 (after we know the message id) and create records
  const storedAttachments = [];
  for (const a of uploadedAttachments) {
    const r2Path = `ticket-attachments/${ticket.ticket_number}/${message.id}/${a.filename}`;
    // Decode base64 back to raw bytes
    const binaryStr = atob(a.resendContent);
    const bytes = Uint8Array.from(binaryStr, (ch) => ch.charCodeAt(0));
    await bucket.put(r2Path, bytes, { httpMetadata: { contentType: a.content_type } });
    const attachmentId = await ticketService.createAttachment({
      ticket_message_id: message.id,
      ticket_id: ticket.id,
      filename: a.filename,
      content_type: a.content_type,
      file_size: a.file_size,
      r2_path: r2Path,
    });
    storedAttachments.push({
      id: attachmentId,
      filename: a.filename,
      content_type: a.content_type,
      file_size: a.file_size,
      r2_path: r2Path,
    });
  }

  // Create email thread
  await ticketService.createEmailThread({
    ticket_id: ticket.id,
    message_id: sentMessageId,
    parent_message_id: lastMessage?.message_id,
  });

  // Notify other admin clients of the reply
  const notificationService = new NotificationService(db);
  await notificationService.create({
    type: "ticket_replied",
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    from_email: fromEmail,
    direction: "outbound",
    summary: bodyText?.slice(0, 200),
  });

  const unreadCount = await notificationService.getUnreadCount();
  await broadcastRealtime(env, {
    type: "ticket_replied",
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    fromEmail: ticket.from_email,
    timestamp: new Date().toISOString(),
    unreadCount,
  });

  return c.json({ success: true, message_id: result.id, attachments: storedAttachments });
});

// Update ticket
adminRoutes.patch("/tickets/:ticketNumber", async (c) => {
  const db = c.env.DB;
  const ticketNumber = c.req.param("ticketNumber");

  const body = await c.req.json<{
    status?: string;
    priority?: string;
    assigned_to?: string;
  }>();

  const ticketService = new TicketService(db);
  const ticket = await ticketService.getTicketByNumber(ticketNumber);

  if (!ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  await ticketService.updateTicket(ticketNumber, body);

  // Notify other admin clients of the status change
  const notificationService = new NotificationService(db);
  await notificationService.create({
    type: "ticket_status_changed",
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    from_email: null,
    direction: null,
  });

  const unreadCount = await notificationService.getUnreadCount();
  await broadcastRealtime(c.env, {
    type: "ticket_status_changed",
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    fromEmail: ticket.from_email,
    timestamp: new Date().toISOString(),
    unreadCount,
  });

  return c.json({ success: true });
});

// Download attachment
adminRoutes.get("/tickets/attachments/:attachmentId", async (c) => {
  const db = c.env.DB;
  const bucket = c.env.PLUGINS_BUCKET;
  const attachmentId = parseInt(c.req.param("attachmentId"), 10);

  const ticketService = new TicketService(db);
  const attachment = await ticketService.getAttachmentById(attachmentId);

  if (!attachment) {
    return c.json({ error: "Attachment not found" }, 404);
  }

  const object = await bucket.get(attachment.r2_path);
  if (!object || !object.body) {
    return c.json({ error: "File not found in storage" }, 404);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": attachment.content_type,
      "Content-Disposition": `attachment; filename="${attachment.filename}"`,
    },
  });
});

// ============================================
// Notifications
// ============================================

// Paginated notification feed (infinite scroll)
adminRoutes.get("/notifications", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);

  const notificationService = new NotificationService(db);
  const { notifications, total } = await notificationService.getPaginated(page, limit);
  const unreadCount = await notificationService.getUnreadCount();

  return c.json({
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Mark a single notification as read
adminRoutes.post("/notifications/:id/read", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);

  const notificationService = new NotificationService(db);
  await notificationService.markRead(id);
  const unreadCount = await notificationService.getUnreadCount();

  return c.json({ success: true, unreadCount });
});

// Mark all notifications as read
adminRoutes.post("/notifications/read-all", async (c) => {
  const db = c.env.DB;
  const notificationService = new NotificationService(db);
  const marked = await notificationService.markAllRead();

  // Tell other admin clients their badge is cleared
  await broadcastRealtime(c.env, {
    type: "notifications_read",
    ticketId: 0,
    ticketNumber: "",
    subject: "",
    fromEmail: "",
    timestamp: new Date().toISOString(),
    unreadCount: 0,
  });

  return c.json({ success: true, marked });
});

// ============================================================
// Telegram bot administration
// ============================================================

adminRoutes.get("/telegram/overview", async (c) => {
  const db = c.env.DB;
  const bot = new TelegramBotService(c.env);

  const [botLogs, webhookStats, botLogStats, authStats, chatState] = await db.batch([
    db.prepare("SELECT COUNT(*) as total FROM telegram_bot_logs"),
    db.prepare("SELECT provider, COUNT(*) as total, MAX(created_at) as last_event FROM webhook_logs GROUP BY provider"),
    db.prepare("SELECT action, COUNT(*) as total FROM telegram_bot_logs GROUP BY action ORDER BY total DESC"),
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors FROM telegram_bot_logs"),
    db.prepare("SELECT COUNT(*) as total FROM telegram_chat_state"),
  ]);

  const activeChats = (chatState.results?.[0] as { total: number })?.total || 0;
  const totals = (authStats.results?.[0] as { total: number; errors: number }) || { total: 0, errors: 0 };
  const botLogTotal = (botLogs.results?.[0] as { total: number })?.total || 0;

  return c.json({
    configured: bot.configured,
    botUsername: c.env.TELEGRAM_BOT_USERNAME || null,
    adminChatId: c.env.TELEGRAM_ADMIN_CHAT_ID ? String(c.env.TELEGRAM_ADMIN_CHAT_ID) : null,
    webhookSecret: Boolean(c.env.TELEGRAM_WEBHOOK_SECRET),
    webhookUrl: `${c.env.API_BASE_URL || "https://api.chatloka.net"}/api/webhooks/telegram`,
    totals: {
      botLogs: botLogTotal,
      botSuccess: botLogTotal - totals.errors,
      botErrors: totals.errors,
      activeChatStates: activeChats,
    },
    providers: webhookStats.results || [],
    actions: (botLogStats.results || []) as { action: string; total: number }[],
  });
});

adminRoutes.get("/logs/webhooks", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = (page - 1) * limit;
  const provider = c.req.query("provider") || "";
  const handled = c.req.query("handled") || "";
  const sort = c.req.query("sort") || "newest";

  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (provider) {
    clauses.push("provider = ?");
    params.push(provider);
    countParams.push(provider);
  }
  if (handled === "0" || handled === "1") {
    clauses.push("handled = ?");
    params.push(parseInt(handled, 10));
    countParams.push(parseInt(handled, 10));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderClause = sort === "oldest" ? "ASC" : "DESC";
  const [logsResult, countResult] = await db.batch([
    db.prepare(`SELECT * FROM webhook_logs ${where} ORDER BY created_at ${orderClause} LIMIT ? OFFSET ?`).bind(...params, limit, offset),
    db.prepare(`SELECT COUNT(*) as total FROM webhook_logs ${where}`).bind(...countParams),
  ]);

  const total = (countResult.results?.[0] as { total: number })?.total || 0;

  return c.json({
    logs: logsResult.results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

adminRoutes.get("/telegram/bot-logs", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);
  const offset = (page - 1) * limit;
  const action = c.req.query("action") || "";
  const sort = c.req.query("sort") || "newest";

  const clauses: string[] = [];
  const params: unknown[] = [];
  const countParams: unknown[] = [];

  if (action) {
    clauses.push("action = ?");
    params.push(action);
    countParams.push(action);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderClause = sort === "oldest" ? "ASC" : "DESC";
  const [logsResult, countResult] = await db.batch([
    db.prepare(`SELECT * FROM telegram_bot_logs ${where} ORDER BY created_at ${orderClause} LIMIT ? OFFSET ?`).bind(...params, limit, offset),
    db.prepare(`SELECT COUNT(*) as total FROM telegram_bot_logs ${where}`).bind(...countParams),
  ]);

  const total = (countResult.results?.[0] as { total: number })?.total || 0;

  return c.json({
    logs: logsResult.results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

adminRoutes.get("/telegram/webhook-info", async (c) => {
  const bot = new TelegramBotService(c.env);
  const api = bot.apiClient;
  if (!api) {
    return c.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, 400);
  }
  const info = await api.getWebhookInfo();
  const me = await api.getMe();
  return c.json({
    webhook: info,
    bot: me || null,
    configuredUrl: `${c.env.API_BASE_URL || "https://api.chatloka.net"}/api/webhooks/telegram`,
  });
});

adminRoutes.post("/telegram/set-webhook", async (c) => {
  const bot = new TelegramBotService(c.env);
  const api = bot.apiClient;
  if (!api) {
    return c.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, 400);
  }
  const webhookUrl = `${c.env.API_BASE_URL || "https://api.chatloka.net"}/api/webhooks/telegram`;
  const result = await api.setWebhook({
    url: webhookUrl,
    ...(c.env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: c.env.TELEGRAM_WEBHOOK_SECRET } : {}),
    allowed_updates: ["message", "callback_query"],
    max_connections: 40,
  });
  return c.json({
    success: result.ok,
    description: result.description,
    error_code: result.error_code,
    url: webhookUrl,
  });
});

adminRoutes.post("/telegram/delete-webhook", async (c) => {
  const bot = new TelegramBotService(c.env);
  const api = bot.apiClient;
  if (!api) {
    return c.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, 400);
  }
  const result = await api.deleteWebhook();
  return c.json({ success: result.ok, description: result.description, error_code: result.error_code });
});

adminRoutes.post("/telegram/test", async (c) => {
  const bot = new TelegramBotService(c.env);
  if (!bot.configured) {
    return c.json({ error: "Telegram bot tidak dikonfigurasi (token / admin chat id)" }, 400);
  }
  const chatId = bot.adminChatId;
  if (chatId === undefined) {
    return c.json({ error: "TELEGRAM_ADMIN_CHAT_ID missing" }, 400);
  }
  const api = bot.apiClient;
  if (!api) {
    return c.json({ error: "TELEGRAM_BOT_TOKEN missing" }, 400);
  }
  const sent = await api.sendMessage(
    chatId,
    "<b>✅ Chatloka Bot terhubung!</b>\n\nMenekan <code>/start</code> untuk menguji.",
    { parse_mode: "HTML" },
  );
  return c.json({ success: Boolean(sent?.message_id), messageId: sent?.message_id });
});
