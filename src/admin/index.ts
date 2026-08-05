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

  const [licensesResult, pluginsResult, tamperResult] = await db.batch([
    db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM licenses"),
    db.prepare("SELECT COUNT(DISTINCT slug) as total FROM plugin_versions"),
    db.prepare("SELECT COUNT(*) as total FROM tamper_logs WHERE created_at > datetime('now', '-24 hours')"),
  ]);

  const licenses = licensesResult.results?.[0] as { total: number; active: number } | undefined;
  const plugins = pluginsResult.results?.[0] as { total: number } | undefined;
  const tamper = tamperResult.results?.[0] as { total: number } | undefined;

  return c.json({
    totalLicenses: licenses?.total || 0,
    activeLicenses: licenses?.active || 0,
    totalPlugins: plugins?.total || 0,
    recentTamperAttempts: tamper?.total || 0,
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

// Logs endpoints
adminRoutes.get("/logs", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(
    "SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 100"
  ).all();
  return c.json({ logs: result.results });
});

adminRoutes.get("/logs/tamper", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare(
    "SELECT * FROM tamper_logs ORDER BY created_at DESC LIMIT 100"
  ).all();
  return c.json({ logs: result.results });
});
