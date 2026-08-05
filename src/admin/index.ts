import { Hono } from "hono";
import { createAuth } from "../auth";
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

  const [licensesResult, pluginsResult, tamperResult, recentLicenses, latestTamper, apiStats] = await db.batch([
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'deactivated' THEN 1 ELSE 0 END) as deactivated, SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended FROM licenses"),
    db.prepare("SELECT COUNT(DISTINCT slug) as total, COUNT(*) as totalVersions FROM plugin_versions"),
    db.prepare("SELECT COUNT(*) as total FROM tamper_logs WHERE created_at > datetime('now', '-24 hours')"),
    db.prepare("SELECT id, purchase_code, domain, status, buyer_email, last_validated_at, created_at FROM licenses ORDER BY created_at DESC LIMIT 5"),
    db.prepare("SELECT id, domain, failures, ip, created_at FROM tamper_logs ORDER BY created_at DESC LIMIT 5"),
    db.prepare(`SELECT COUNT(*) as total_24h, SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success, SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_error, SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error, AVG(response_time_ms) as avg_response FROM api_logs WHERE created_at > datetime('now', '-24 hours')`),
  ]);

  const licenses = licensesResult.results?.[0] as { total: number; active: number; deactivated: number; suspended: number } | undefined;
  const plugins = pluginsResult.results?.[0] as { total: number; totalVersions: number } | undefined;
  const tamper = tamperResult.results?.[0] as { total: number } | undefined;
  const api = apiStats.results?.[0] as { total_24h: number; success: number; client_error: number; server_error: number; avg_response: number } | undefined;

  return c.json({
    totalLicenses: licenses?.total || 0,
    activeLicenses: licenses?.active || 0,
    deactivatedLicenses: licenses?.deactivated || 0,
    suspendedLicenses: licenses?.suspended || 0,
    totalPlugins: plugins?.total || 0,
    totalPluginVersions: plugins?.totalVersions || 0,
    recentTamperAttempts: tamper?.total || 0,
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

  if (!["regular", "extended", "lifetime"].includes(licenseType)) {
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
