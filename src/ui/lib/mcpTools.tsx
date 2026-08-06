import type { ReactNode } from "react"
import {
  IconLicense,
  IconPlug,
  IconTicket,
  IconUsers,
  IconRocket,
  IconBell,
  IconActivity,
  IconChartBar,
  IconSearch,
  IconPlus,
  IconEdit,
  IconTrash,
  IconDownload,
  IconLink,
  IconInbox,
  IconSend,
  IconArrowsJoin,
  IconCheck,
  IconEye,
  IconHistory,
  IconList,
  IconShield,
  IconDatabase,
  IconServer,
  IconStack2,
  IconRefresh,
  IconTag,
  IconWorld,
  IconClipboard,
  IconMessage,
  IconSettings,
  IconFolder,
  IconFolderPlus,
  IconChartPie,
  IconStar,
  IconBolt,
  IconCircleCheck,
  IconUpload,
} from "@tabler/icons-react"

export type ToolCategory = "License" | "Plugins" | "Tickets" | "Contacts" | "Releases" | "Notifications" | "Monitoring" | "Files"

export interface McpParam {
  name: string
  type: string
  required: boolean
  description: string
}

export interface McpTool {
  name: string
  category: ToolCategory
  icon: ReactNode
  short: string
  description: string
  params: McpParam[]
  example: string
}

const p = (
  name: string,
  type: string,
  required: boolean,
  description: string,
): McpParam => ({ name, type, required, description })

export const CATEGORY_ICONS: Record<ToolCategory, ReactNode> = {
  License: <IconLicense className="h-4 w-4" />,
  Plugins: <IconPlug className="h-4 w-4" />,
  Tickets: <IconTicket className="h-4 w-4" />,
  Contacts: <IconUsers className="h-4 w-4" />,
  Releases: <IconRocket className="h-4 w-4" />,
  Notifications: <IconBell className="h-4 w-4" />,
  Monitoring: <IconActivity className="h-4 w-4" />,
  Files: <IconFolder className="h-4 w-4" />,
}

export const MCP_TOOLS: McpTool[] = [
  // ─── License ───────────────────────────────────────────────
  {
    name: "get_licenses",
    category: "License",
    icon: <IconList className="h-4 w-4" />,
    short: "List all licenses",
    description:
      "Returns every license in the system: purchase code, bound domain, status, license type, buyer info, and all timestamps (activated, last validated, created, updated). Ordered newest first. Useful for a full inventory snapshot.",
    params: [],
    example: "get_licenses()",
  },
  {
    name: "get_license",
    category: "License",
    icon: <IconSearch className="h-4 w-4" />,
    short: "Get license by purchase code",
    description:
      "Fetches a single license by its purchase code. Includes item info, support expiry, buyer details, and every timestamp. Returns an error message if the purchase code does not exist.",
    params: [p("purchase_code", "string", true, "The purchase code to look up")],
    example: "get_license({ purchase_code: \"a1b2c3d4-...\" })",
  },
  {
    name: "create_license",
    category: "License",
    icon: <IconPlus className="h-4 w-4" />,
    short: "Create a new license",
    description:
      "Manually creates a license record. Requires a unique purchase code and a domain. Optionally set the license type (regular/extended, default regular) and buyer contact info. Rejects duplicate purchase codes.",
    params: [
      p("purchase_code", "string", true, "Unique purchase code"),
      p("domain", "string", true, "Domain to bind the license to"),
      p("license_type", "regular | extended", false, "License type, defaults to regular"),
      p("buyer_email", "string", false, "Buyer email address"),
      p("buyer_name", "string", false, "Buyer name"),
    ],
    example: "create_license({ purchase_code: \"...\", domain: \"client.com\", license_type: \"extended\" })",
  },
  {
    name: "update_license_status",
    category: "License",
    icon: <IconRefresh className="h-4 w-4" />,
    short: "Change license status",
    description:
      "Changes a license status to active, deactivated, or suspended. Reports the old and new status. Use to disable a misbehaving client, reactivate a paid license, or suspend pending resolution.",
    params: [
      p("purchase_code", "string", true, "The purchase code of the license"),
      p("status", "active | deactivated | suspended", true, "New status"),
    ],
    example: "update_license_status({ purchase_code: \"...\", status: \"suspended\" })",
  },
  {
    name: "update_license_domain",
    category: "License",
    icon: <IconWorld className="h-4 w-4" />,
    short: "Change bound domain",
    description:
      "Moves a license to a new domain. The previous domain is preserved in the domain_history audit trail with a timestamp, so domain changes are fully traceable.",
    params: [
      p("purchase_code", "string", true, "The purchase code of the license"),
      p("new_domain", "string", true, "The new domain to bind"),
    ],
    example: "update_license_domain({ purchase_code: \"...\", new_domain: \"newclient.com\" })",
  },
  {
    name: "verify_purchase_code",
    category: "License",
    icon: <IconShield className="h-4 w-4" />,
    short: "Verify against Envato API",
    description:
      "Verifies a purchase code against the Envato API. Returns validity, buyer, license type, item, sold date, and supported-until date. Detects revoked/refunded codes (410). Use before creating licenses or answering support.",
    params: [p("purchase_code", "string", true, "The Envato purchase code to verify")],
    example: "verify_purchase_code({ purchase_code: \"...\" })",
  },
  {
    name: "get_license_features",
    category: "License",
    icon: <IconTag className="h-4 w-4" />,
    short: "Get feature list for type",
    description:
      "Returns the feature matrix for a license type (regular or extended). Shows which capabilities unlock per tier — plugins & API docs are always on; SaaS, billing, subscriptions and credit system require extended.",
    params: [p("license_type", "regular | extended", true, "License type to check")],
    example: "get_license_features({ license_type: \"extended\" })",
  },
  {
    name: "get_validation_logs",
    category: "License",
    icon: <IconHistory className="h-4 w-4" />,
    short: "Validation history",
    description:
      "Returns the activation / validation / deactivation history of a license, including IP address, user agent, and timestamps. Invaluable for investigating abuse or support questions about activation failures.",
    params: [
      p("purchase_code", "string", true, "The purchase code to get logs for"),
      p("limit", "number", false, "Max results, defaults to 50"),
    ],
    example: "get_validation_logs({ purchase_code: \"...\", limit: 20 })",
  },
  {
    name: "get_domain_history",
    category: "License",
    icon: <IconFolder className="h-4 w-4" />,
    short: "Domain change history",
    description:
      "Returns every domain change applied to a license (old → new) with timestamps. Use when a customer claims they never changed domain, or to spot serial domain-hoppers.",
    params: [p("purchase_code", "string", true, "The purchase code to get domain history for")],
    example: "get_domain_history({ purchase_code: \"...\" })",
  },

  // ─── Plugins ───────────────────────────────────────────────
  {
    name: "get_plugins",
    category: "Plugins",
    icon: <IconPlug className="h-4 w-4" />,
    short: "List all plugins",
    description:
      "Lists every plugin slug with its latest version, changelog, checksum, required ChatLoka version, and release date. One entry per plugin (latest release only).",
    params: [],
    example: "get_plugins()",
  },
  {
    name: "get_plugin_versions",
    category: "Plugins",
    icon: <IconStack2 className="h-4 w-4" />,
    short: "All versions for a plugin",
    description:
      "Returns the complete version history for a plugin slug: every release with changelog, checksum, required ChatLoka version, and which is flagged latest.",
    params: [p("slug", "string", true, "The plugin slug to look up")],
    example: "get_plugin_versions({ slug: \"wa-gateway\" })",
  },
  {
    name: "get_plugin_download_logs",
    category: "Plugins",
    icon: <IconDownload className="h-4 w-4" />,
    short: "Download history",
    description:
      "Shows who downloaded which plugin, when, and from which IP. Optionally filter by plugin slug. Useful for verifying a customer really downloaded a version.",
    params: [
      p("slug", "string", false, "Filter by plugin slug"),
      p("limit", "number", false, "Max results, defaults to 50"),
    ],
    example: "get_plugin_download_logs({ slug: \"wa-gateway\", limit: 10 })",
  },
  {
    name: "generate_plugin_download_link",
    category: "Plugins",
    icon: <IconLink className="h-4 w-4" />,
    short: "Generate download URL + token",
    description:
      "Creates a one-time JWT download link for a plugin (or a specific version). The token must be sent as the X-Download-Token header. Expires in 1 hour and can only be used once. Returns URL, token, filename, checksum and instructions.",
    params: [
      p("slug", "string", true, "Plugin slug"),
      p("version", "string", false, "Specific version, defaults to latest"),
      p("purchase_code", "string", false, "Purchase code recorded on the token, defaults to admin"),
    ],
    example: "generate_plugin_download_link({ slug: \"wa-gateway\" })",
  },
  {
    name: "generate_plugin_upload_link",
    category: "Plugins",
    icon: <IconUpload className="h-4 w-4" />,
    short: "Step 1 — get a signed upload URL",
    description:
      "STEP 1 of releasing a new plugin version from your machine/VPS. Returns a one-time signed PUT URL (15 min, single-use) plus a curl command to stream the .zip through the worker to R2. Files up to 95 MB go via curl; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). Does NOT register the version — finish with publish_plugin_version.",
    params: [
      p("slug", "string", true, "Plugin slug (letters, digits, _ or -)"),
      p("version", "string", true, "New version to release (e.g. 1.2.0)"),
      p("file_size", "number", false, "Zip size in bytes. If > 95 MB you get rclone instructions instead of a signed URL"),
    ],
    example: "generate_plugin_upload_link({ slug: \"saas\", version: \"1.2.0\", file_size: 82453412 })",
  },
  {
    name: "publish_plugin_version",
    category: "Plugins",
    icon: <IconCircleCheck className="h-4 w-4" />,
    short: "STEP 2 — register uploaded version",
    description:
      "STEP 2 of releasing a plugin version (always runs after the upload). REGISTERS a .zip that is already in R2 — it does not upload anything. Verifies the object exists via bucket.head, then inserts the version row and marks it latest. The checksum (REQUIRED) is the SHA-256 hex from `sha256sum <zipfile>`; it powers integrity/tamper detection.",
    params: [
      p("slug", "string", true, "Plugin slug"),
      p("version", "string", true, "Version that was uploaded"),
      p("checksum", "string", true, "REQUIRED. SHA-256 hex of the zip (run: sha256sum <zipfile>)"),
      p("changelog", "string", false, "Release notes / changelog"),
      p("requires_chaton", "string", false, "Minimum Chatloka app version needed (e.g. 1.4.0)"),
    ],
    example: "publish_plugin_version({ slug: \"saas\", version: \"1.2.0\", checksum: \"e4d90ab2...\", changelog: \"Fixes payment webhook\" })",
  },

  // ─── Tickets ───────────────────────────────────────────────
  {
    name: "get_tickets",
    category: "Tickets",
    icon: <IconTicket className="h-4 w-4" />,
    short: "List support tickets",
    description:
      "Lists support tickets with filters: status (all/open/pending/closed/merged), keyword search across number/email/subject, sort by last message, and pagination. Each row includes contact badge info (lead/customer + support status).",
    params: [
      p("status", "all | open | pending | closed | merged", false, "Filter by status, defaults to all"),
      p("search", "string", false, "Search across ticket number, sender email, and subject"),
      p("sort", "newest | oldest", false, "Sort by last message time, defaults to newest"),
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 50, max 200"),
    ],
    example: "get_tickets({ status: \"open\", search: \"punyakursus\" })",
  },
  {
    name: "get_ticket",
    category: "Tickets",
    icon: <IconMessage className="h-4 w-4" />,
    short: "Full ticket detail",
    description:
      "Returns a complete ticket: every message with attachments, thread participants (who is CC'd on replies), merged-ticket context (what was merged in / into what), and the linked contact profile with purchases and support status.",
    params: [p("ticket_number", "string", true, "The ticket number (e.g. TICKET-00002)")],
    example: "get_ticket({ ticket_number: \"TICKET-00002\" })",
  },
  {
    name: "get_ticket_attachments",
    category: "Tickets",
    icon: <IconClipboard className="h-4 w-4" />,
    short: "List ticket attachments",
    description:
      "Lists every attachment across a ticket's messages: filename, content type, size, which message/direction it belongs to, and when it arrived. Pair with generate_attachment_download_link to fetch a specific file.",
    params: [p("ticket_number", "string", true, "The ticket number (e.g. TICKET-00002)")],
    example: "get_ticket_attachments({ ticket_number: \"TICKET-00002\" })",
  },
  {
    name: "reply_ticket",
    category: "Tickets",
    icon: <IconSend className="h-4 w-4" />,
    short: "Send email reply",
    description:
      "Sends an email reply to a ticket from the support inbox. Automatically adds the tracking footer, threading headers (In-Reply-To/References), and CCs non-admin participants. Stores the outbound message and fires a notification. The customer's next reply stays in the same ticket.",
    params: [
      p("ticket_number", "string", true, "The ticket number (e.g. TICKET-00002)"),
      p("body_html", "string", true, "HTML body of the reply"),
      p("body_text", "string", false, "Plain-text alternative of the reply"),
    ],
    example: "reply_ticket({ ticket_number: \"TICKET-00002\", body_html: \"<p>Halo, sudah kami bantu...</p>\" })",
  },
  {
    name: "update_ticket_status",
    category: "Tickets",
    icon: <IconCircleCheck className="h-4 w-4" />,
    short: "Change ticket status",
    description:
      "Sets a ticket status to open, pending, or closed. Logs a ticket_status_changed notification so other admin clients see the update in real time.",
    params: [
      p("ticket_number", "string", true, "The ticket number (e.g. TICKET-00002)"),
      p("status", "open | pending | closed", true, "New ticket status"),
    ],
    example: "update_ticket_status({ ticket_number: \"TICKET-00002\", status: \"closed\" })",
  },
  {
    name: "update_ticket_priority",
    category: "Tickets",
    icon: <IconBolt className="h-4 w-4" />,
    short: "Change ticket priority",
    description:
      "Sets a ticket priority to low, medium, or high. Use high for urgent production issues so the team can sort the queue.",
    params: [
      p("ticket_number", "string", true, "The ticket number (e.g. TICKET-00002)"),
      p("priority", "low | medium | high", true, "New priority"),
    ],
    example: "update_ticket_priority({ ticket_number: \"TICKET-00002\", priority: \"high\" })",
  },
  {
    name: "merge_tickets",
    category: "Tickets",
    icon: <IconArrowsJoin className="h-4 w-4" />,
    short: "Merge tickets",
    description:
      "Merges one or more source tickets into a target ticket (or a fresh container ticket). Sources become status 'merged' (kept for audit), messages/attachments/participants move to the target, and automated notes record what happened.",
    params: [
      p("source_ticket_numbers", "string[]", true, "Tickets to merge in"),
      p("target_ticket_number", "string", false, "Existing ticket to merge into. Omit to create a new container ticket"),
      p("new_ticket_subject", "string", false, "Subject for the new container ticket (only when target omitted)"),
    ],
    example: "merge_tickets({ source_ticket_numbers: [\"TICKET-00001\", \"TICKET-00003\"] })",
  },
  {
    name: "get_ticket_stats",
    category: "Tickets",
    icon: <IconChartPie className="h-4 w-4" />,
    short: "Ticket counts",
    description:
      "Returns total, open, pending, and closed ticket counts. Quick health check of the support queue.",
    params: [],
    example: "get_ticket_stats()",
  },
  {
    name: "get_ticket_analytics",
    category: "Tickets",
    icon: <IconChartBar className="h-4 w-4" />,
    short: "Support performance analytics",
    description:
      "Deep analytics in WIB (UTC+7): first-response & average-response times, per-weekday and per-hour-of-day breakdowns, first-response rate, and the slowest reply gaps. Use to find where support is slowest.",
    params: [],
    example: "get_ticket_analytics()",
  },
  {
    name: "get_unread_tickets",
    category: "Tickets",
    icon: <IconInbox className="h-4 w-4" />,
    short: "Unread inbox",
    description:
      "Returns tickets whose latest message came from a customer and has not been seen by the admin yet — the live inbox. Ordered most recent first.",
    params: [p("limit", "number", false, "Max results, defaults to 50")],
    example: "get_unread_tickets({ limit: 10 })",
  },
  {
    name: "mark_tickets_read",
    category: "Tickets",
    icon: <IconEye className="h-4 w-4" />,
    short: "Mark tickets as read",
    description:
      "Marks one ticket as read by the admin (ticket_number), or clears the whole unread inbox when no ticket is given. Mirrors opening tickets in the UI.",
    params: [p("ticket_number", "string", false, "Mark a single ticket read. Omit to mark all unread tickets read")],
    example: "mark_tickets_read({ ticket_number: \"TICKET-00002\" })",
  },
  {
    name: "generate_attachment_download_link",
    category: "Tickets",
    icon: <IconDownload className="h-4 w-4" />,
    short: "Attachment download link",
    description:
      "Creates a one-time JWT download link for a ticket attachment. The token must be sent as the X-Download-Token header; it expires in 1 hour and is single-use. Get the attachment_id from get_ticket or get_ticket_attachments.",
    params: [p("attachment_id", "number", true, "The attachment ID (from get_ticket or get_ticket_attachments)")],
    example: "generate_attachment_download_link({ attachment_id: 42 })",
  },

  // ─── Contacts ──────────────────────────────────────────────
  {
    name: "get_contacts",
    category: "Contacts",
    icon: <IconUsers className="h-4 w-4" />,
    short: "List contacts",
    description:
      "Lists everyone who has contacted support: lead/customer type, latest purchase code & license type, support status (active/expired/none), and ticket count. Search by email, name, or purchase code; filter by type.",
    params: [
      p("search", "string", false, "Search across email, name, and purchase code"),
      p("type", "lead | customer", false, "Filter by contact type"),
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 20, max 100"),
    ],
    example: "get_contacts({ search: \"punyakursus\", type: \"customer\" })",
  },
  {
    name: "get_contact",
    category: "Contacts",
    icon: <IconStar className="h-4 w-4" />,
    short: "Contact detail",
    description:
      "Full profile of a contact: all linked purchase codes with support expiry, support status, and their ticket history. Look up by contact_id or email.",
    params: [
      p("contact_id", "number", false, "Contact ID"),
      p("email", "string", false, "Or look up by email address"),
    ],
    example: "get_contact({ email: \"punyakursus@gmail.com\" })",
  },
  {
    name: "add_contact_purchase",
    category: "Contacts",
    icon: <IconPlus className="h-4 w-4" />,
    short: "Link purchase, promote to customer",
    description:
      "Attaches a purchase code to a contact and promotes Lead → Customer. By default auto-verifies against Envato to fill license type, item name, purchase date, and support-until. Can be disabled and filled manually.",
    params: [
      p("contact_id", "number", true, "The contact's database ID"),
      p("purchase_code", "string", true, "The Envato purchase code"),
      p("verify", "boolean", false, "Auto-verify against Envato, defaults to true"),
      p("license_type", "regular | extended", false, "Manual license type (when verify=false)"),
      p("item_name", "string", false, "Manual item name"),
      p("purchase_date", "string", false, "Manual purchase date (ISO)"),
      p("support_until", "string", false, "Manual support-expiry date (ISO)"),
    ],
    example: "add_contact_purchase({ contact_id: 3, purchase_code: \"...\", verify: true })",
  },
  {
    name: "update_contact_purchase",
    category: "Contacts",
    icon: <IconEdit className="h-4 w-4" />,
    short: "Edit a purchase record",
    description:
      "Updates an existing purchase record: license type, item name, purchase date, support expiry, or support term months. Use to correct mistakes or extend support.",
    params: [
      p("purchase_id", "number", true, "The purchase record ID"),
      p("license_type", "regular | extended", false, "New license type"),
      p("item_name", "string", false, "New item name"),
      p("purchase_date", "string", false, "New purchase date (ISO)"),
      p("support_until", "string", false, "New support expiry (ISO)"),
      p("support_term_months", "number", false, "Support term in months (6 or 12)"),
    ],
    example: "update_contact_purchase({ purchase_id: 5, support_until: \"2027-08-06T00:00:00Z\" })",
  },
  {
    name: "remove_contact_purchase",
    category: "Contacts",
    icon: <IconTrash className="h-4 w-4" />,
    short: "Remove purchase record",
    description:
      "Removes a purchase code from a contact. If it was their last purchase, the contact is demoted from Customer back to Lead automatically.",
    params: [p("purchase_id", "number", true, "The purchase record ID")],
    example: "remove_contact_purchase({ purchase_id: 5 })",
  },
  {
    name: "update_contact",
    category: "Contacts",
    icon: <IconSettings className="h-4 w-4" />,
    short: "Update contact name / notes",
    description:
      "Updates a contact's display name and/or internal admin notes (notes are only visible in the admin panel, never to the customer).",
    params: [
      p("contact_id", "number", true, "Contact ID"),
      p("name", "string", false, "New display name"),
      p("notes", "string", false, "Admin notes"),
    ],
    example: "update_contact({ contact_id: 3, notes: \"VIP — minta prioritas\" })",
  },

  // ─── Releases ──────────────────────────────────────────────
  {
    name: "get_app_versions",
    category: "Releases",
    icon: <IconRocket className="h-4 w-4" />,
    short: "List app release versions",
    description:
      "Lists every Chatloka core app release: version, changelog, checksum, file size, minimum PHP version, breaking changes, and which is flagged latest. Check what clients will upgrade to.",
    params: [],
    example: "get_app_versions()",
  },
  {
    name: "generate_release_download_link",
    category: "Releases",
    icon: <IconLink className="h-4 w-4" />,
    short: "App release download link",
    description:
      "Creates a one-time JWT download link for a Chatloka core app release (like generate_plugin_download_link but for the app). Token must be sent as X-Download-Token header, expires in 1 hour, single-use. Returns URL, token, checksum, and instructions.",
    params: [
      p("version", "string", false, "Specific release version, defaults to the latest"),
      p("purchase_code", "string", false, "Purchase code recorded on the token, defaults to admin-mcp"),
    ],
    example: "generate_release_download_link({ version: \"1.2.0\" })",
  },
  {
    name: "generate_app_upload_link",
    category: "Releases",
    icon: <IconUpload className="h-4 w-4" />,
    short: "STEP 1 — get a signed upload URL",
    description:
      "STEP 1 of releasing a new Chatloka core app version from your machine/VPS. Returns a one-time signed PUT URL (15 min, single-use) plus a curl command to stream the .zip through the worker to R2. Files up to 95 MB go via curl; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). Does NOT register the version — finish with publish_app_version.",
    params: [
      p("version", "string", false, "New release version (semver, e.g. 1.5.0)"),
      p("file_size", "number", false, "Zip size in bytes. If > 95 MB you get rclone instructions instead of a signed URL"),
    ],
    example: "generate_app_upload_link({ version: \"1.5.0\", file_size: 130000000 })",
  },
  {
    name: "publish_app_version",
    category: "Releases",
    icon: <IconCircleCheck className="h-4 w-4" />,
    short: "STEP 2 — register uploaded release",
    description:
      "STEP 2 of releasing an app version (always runs after the upload). REGISTERS a .zip that is already in R2 — it does not upload anything. Verifies the object exists via bucket.head, then inserts the version row and marks it latest. The checksum (REQUIRED) is the SHA-256 hex from `sha256sum chatloka-<version>.zip`; it powers integrity/tamper detection.",
    params: [
      p("version", "string", true, "Release version that was uploaded (semver)"),
      p("checksum", "string", true, "REQUIRED. SHA-256 hex of the zip (run: sha256sum chatloka-<version>.zip)"),
      p("changelog", "string", false, "Release changelog"),
      p("file_size", "number", false, "Zip size in bytes (shown to clients in the update payload)"),
      p("min_php_version", "string", false, "Minimum PHP version, defaults to 8.2"),
      p("min_chatloka_version", "string", false, "Minimum Chatloka version this release requires"),
      p("breaking_changes", "string", false, "JSON array of breaking-change descriptions, e.g. [\"Drops PHP 8.0 support\"]"),
    ],
    example: "publish_app_version({ version: \"1.5.0\", checksum: \"a1b2c3d4...\", changelog: \"New dashboard\", min_php_version: \"8.2\" })",
  },
  {
    name: "get_app_update_logs",
    category: "Releases",
    icon: <IconHistory className="h-4 w-4" />,
    short: "Client update logs",
    description:
      "Searches client-side app update attempts: which purchase codes/domains upgraded (or rolled back) between which versions, success/failure, and error messages. Use when a client reports a broken update.",
    params: [
      p("search", "string", false, "Search across purchase code and domain"),
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 50"),
    ],
    example: "get_app_update_logs({ search: \"punyakursus\" })",
  },

  // ─── Notifications ─────────────────────────────────────────
  {
    name: "get_notifications",
    category: "Notifications",
    icon: <IconBell className="h-4 w-4" />,
    short: "Notification feed",
    description:
      "Returns the admin notification feed (ticket created, new inbound message, reply sent, status changed, reopened) with unread count and pagination. Use to catch up on activity.",
    params: [
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 50"),
    ],
    example: "get_notifications({ limit: 10 })",
  },
  {
    name: "mark_notifications_read",
    category: "Notifications",
    icon: <IconCheck className="h-4 w-4" />,
    short: "Mark notifications read",
    description:
      "Marks a single notification read (by id) or clears the entire notification feed.",
    params: [p("notification_id", "number", false, "Mark a single notification read. Omit to mark all read")],
    example: "mark_notifications_read()",
  },

  // ─── Files (R2 File Manager) ────────────────────────────────
  {
    name: "get_files",
    category: "Files",
    icon: <IconFolder className="h-4 w-4" />,
    short: "List files & folders in R2",
    description:
      "Lists objects in the R2 File Manager. Pass a folder path (e.g. 'files/' for the internal file area, 'plugins/' or 'app-releases/' for anything else in the bucket) to get that folder's sub-folders and files with size, upload date, content type and SHA-256 checksum. Set search to find files by name inside the folder (recursive).",
    params: [
      p("folder", "string", false, "Folder path to list ('' = root, 'files/', 'files/specs/'). Defaults to ''"),
      p("search", "string", false, "Search by file name inside the folder (recursive)"),
      p("cursor", "string", false, "Pagination cursor from a previous response"),
      p("limit", "number", false, "Max entries, defaults to 200, max 1000"),
    ],
    example: "get_files({ folder: \"files/specs/\" })",
  },
  {
    name: "create_folder",
    category: "Files",
    icon: <IconFolderPlus className="h-4 w-4" />,
    short: "Create a folder in R2",
    description:
      "Creates a folder in the R2 File Manager (a zero-byte placeholder object, the standard R2 convention). Pass the full path, e.g. 'files/specs/2025' or 'files/custom-solutions/buyer-x'. Nested folders appear automatically once a file lands inside them, but this makes the folder visible in listings even before that.",
    params: [p("path", "string", true, "Folder path to create (e.g. files/specs/2025)")],
    example: "create_folder({ path: \"files/specs/2025\" })",
  },
  {
    name: "generate_file_upload_link",
    category: "Files",
    icon: <IconUpload className="h-4 w-4" />,
    short: "Get a signed upload link",
    description:
      "Uploads a file to the R2 File Manager from your machine/VPS. Returns a one-time signed PUT URL (15 min, single-use) with a curl command. Files up to 95 MB stream through the worker; larger files get rclone/AWS CLI instructions that go straight to R2 (S3 multipart, resumable). Unlike release uploads there is NO publish step — once the upload finishes the file is immediately live.",
    params: [
      p("folder", "string", false, "Destination folder, defaults to 'files/' (e.g. files/specs/)"),
      p("filename", "string", true, "File name without slashes (e.g. spec-v2.pdf)"),
      p("file_size", "number", false, "File size in bytes. If > 95 MB you get rclone instructions instead of a signed URL"),
      p("content_type", "string", false, "Content type to store (e.g. application/pdf)"),
    ],
    example: "generate_file_upload_link({ folder: \"files/specs/\", filename: \"spec-v2.pdf\" })",
  },
  {
    name: "generate_file_download_link",
    category: "Files",
    icon: <IconDownload className="h-4 w-4" />,
    short: "Signed download URL for a file",
    description:
      "Generates a one-time signed download URL for a file in the R2 File Manager. Works with plain curl (no headers), expires after 1 hour or first use. The file streams with its stored content type and checksum headers.",
    params: [p("key", "string", true, "Full object key, e.g. files/specs/spec-v2.pdf")],
    example: "generate_file_download_link({ key: \"files/specs/spec-v2.pdf\" })",
  },
  {
    name: "delete_file",
    category: "Files",
    icon: <IconTrash className="h-4 w-4" />,
    short: "Delete a file or folder recursively",
    description:
      "Deletes a file or an entire folder from the R2 File Manager (or anywhere in the bucket). Pass an exact key (e.g. 'files/specs/old.pdf') or a folder path ending with '/' to delete everything inside it recursively. Returns how many objects were removed. Irreversible.",
    params: [p("key", "string", true, "Object key to delete. End with '/' to delete a whole folder recursively")],
    example: "delete_file({ key: \"files/custom-solutions/buyer-x/\" })",
  },

  // ─── Monitoring ────────────────────────────────────────────
  {
    name: "get_api_logs",
    category: "Monitoring",
    icon: <IconServer className="h-4 w-4" />,
    short: "API request logs",
    description:
      "Searches API request logs with filters: endpoint (partial match), status code, keyword across endpoint/IP/purchase code/user agent, plus pagination and sort. Each row includes response time.",
    params: [
      p("endpoint", "string", false, "Filter by endpoint path (partial match)"),
      p("status", "number", false, "Filter by HTTP status code"),
      p("search", "string", false, "Search across endpoint, IP, purchase_code, user_agent"),
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 50, max 200"),
      p("sort", "newest | oldest", false, "Sort order, defaults to newest"),
    ],
    example: "get_api_logs({ endpoint: \"/api/validate\", status: 401, limit: 20 })",
  },
  {
    name: "get_tamper_logs",
    category: "Monitoring",
    icon: <IconShield className="h-4 w-4" />,
    short: "Tamper detection logs",
    description:
      "Shows file-integrity check failures: which license/domain/IP failed validation and when. Search across domain and IP with pagination.",
    params: [
      p("search", "string", false, "Search across domain and IP"),
      p("page", "number", false, "Page number, defaults to 1"),
      p("limit", "number", false, "Results per page, defaults to 50, max 200"),
      p("sort", "newest | oldest", false, "Sort order, defaults to newest"),
    ],
    example: "get_tamper_logs({ search: \"1.2.3.4\" })",
  },
  {
    name: "get_api_stats",
    category: "Monitoring",
    icon: <IconActivity className="h-4 w-4" />,
    short: "24h API statistics",
    description:
      "24-hour API health: total requests, success/client-error/server-error counts, average & max response time, and the top 10 hit endpoints.",
    params: [],
    example: "get_api_stats()",
  },
  {
    name: "get_dashboard_stats",
    category: "Monitoring",
    icon: <IconDatabase className="h-4 w-4" />,
    short: "Aggregate dashboard stats",
    description:
      "One-shot aggregate snapshot: license counts by status, plugin/version counts, tamper events in the last 24h, and the 5 most recently created licenses.",
    params: [],
    example: "get_dashboard_stats()",
  },
]

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((t) => [t.name, t]))

export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  License: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  Plugins: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  Tickets: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  Contacts: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  Releases: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  Notifications: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20",
  Monitoring: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  Files: "bg-orange-500/15 text-orange-400 border-orange-500/20",
}
