# AGENTS.md

> Instructions for AI coding agents working on this repository.

---

## CRITICAL RULES

1. **NEVER COMMIT OR PUSH WITHOUT EXPLICIT USER APPROVAL.**
   - Auto-pushes waste build minutes (Workers auto-deploy on push to `main`).
   - Always ask the user before running `git commit` or `git push`.
   - If the user approves, commit and push as a single atomic operation.

2. **ALWAYS run `npm run typecheck && npm run lint` BEFORE presenting any summary of changes.**
   - Fix all errors before reporting completion.
   - Zero TypeScript errors, zero ESLint warnings.

3. **Do not re-enable Turnstile captcha unless the user explicitly asks.**
   - Captcha is intentionally disabled in both `src/auth/index.ts` (auth config plugin) and `src/ui/pages/Login.tsx` (form UI).
   - `TURNSTILE_SECRET_KEY` is already set as a Cloudflare secret and `TURNSTILE_SITE_KEY` is in `wrangler.jsonc` vars for future use.

4. **Do not commit secrets, keys, or tokens.** Never log or expose API keys, database credentials, or tokens in code.

5. **Follow existing code conventions.** Match the style, patterns, and libraries already in use. Do not introduce new frameworks or major dependencies without user approval.

6. **NEVER MAKE ASSUMPTIONS. NEVER GUESS. NEVER FABRICATE ANSWERS.**
   - Do NOT assume API signatures, method names, configuration options, or package behavior.
   - Do NOT guess how a library works — ALWAYS check the official documentation first.
   - If unsure or uncertain about ANY implementation detail, STOP and use `WebSearch` or `WebFetch` to verify against official documentation.
   - Wrong assumptions waste time and cause bugs. It is ALWAYS better to spend 30 seconds verifying than to spend 30 minutes fixing.
   - This applies to: Laravel APIs, package APIs, PHP functions, Tailwind classes, shadcn component props, Hono middleware, Cloudflare Workers APIs, Better Auth APIs, and ANY other technology.
   - Example: Before using `Updater::update()`, verify the exact method signature in the package's official docs or source code. Do NOT assume it works a certain way.

---

## Tech Stack

### Backend (Cloudflare Worker)
| Technology | Version | Purpose |
|---|---|---|
| **Cloudflare Workers** | — | Runtime (V8 isolates, 10ms CPU time limit) |
| **Hono** | 4.13+ | HTTP framework |
| **Better Auth** | 1.6+ | Authentication (PBKDF2 via Web Crypto API) |
| **D1** | — | SQLite database on Cloudflare (binding: `DB`) |
| **R2** | — | Object storage for plugin + app release .zip files (binding: `PLUGINS_BUCKET`) |
| **MCP SDK** | 2.0+ | Model Context Protocol server (`@modelcontextprotocol/server` + `@modelcontextprotocol/hono`) |
| **Cloudflare Workflows** | — | Durable AI pipeline (`ticket-ai-analysis` binding `TICKET_AI_WORKFLOW`) |
| **OpenAI API** | gpt-5.4-mini | Ticket AI triage (structured outputs, direct fetch — no SDK) |
| **TypeScript** | 6.0 | Language |
| **Wrangler** | — | CLI, build, deploy |

### Frontend (React SPA)
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19 | UI library |
| **Vite** | 8 | Bundler |
| **Tailwind CSS** | 4.3+ | Utility-first CSS |
| **shadcn/ui** | — | Component library (base-ui preset `b377ZhrwLQ`, blue primary) |
| **@tabler/icons-react** | 3.46+ | Icons (NOT lucide-react — do not use) |
| **@fontsource-variable/figtree** | 5.3+ | Font (Figtree Variable) |
| **React Router** | — | Client-side routing |
| **Recharts** | — | Charts (Dashboard) |
| **Sonner** | — | Toast notifications |
| **react-markdown** | 10+ | Markdown rendering (File Manager `.md` preview) + `remark-gfm`, `rehype-highlight`, `highlight.js` |
| **Cloudflare Vite plugin** | — | SPA + Worker in single project |

### Dev Tools
| Tool | Purpose |
|---|---|
| **ESLint** | Linting |
| **TypeScript (`tsc`)** | Type checking |
| **patch-wrangler.js** | Post-build: injects `run_worker_first` into `wrangler.jsonc` (stripped by Cloudflare Vite plugin) |

---

## Commands

```bash
# Development
npm run dev            # Start Wrangler dev server

# Type check & lint (run before every commit)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .

# Build & deploy
npm run build          # vite build && node scripts/patch-wrangler.js
npm run deploy         # npm run build && wrangler deploy

# Other
npm run cf-typegen     # Generate CloudflareBindings type
npm run lint:fix       # Auto-fix ESLint issues
```

---

## Project Structure

```
chatlokaapi/
├── src/
│   ├── index.ts              # Entry point: CORS, routes, SPA fallback
│   ├── types.ts              # CloudflareBindings interface
│   ├── auth/
│   │   └── index.ts          # Better Auth config (PBKDF2, disableSignUp)
│   ├── admin/
│   │   └── index.ts          # Admin API routes (session-guarded)
│   ├── services/
│   │   ├── license.ts        # LicenseService (D1 CRUD + tamper detection)
│   │   ├── plugin.ts         # PluginService (D1 + R2)
│   │   ├── fileManager.ts    # FileManagerService (R2 list/folder/delete/upload)
│   │   ├── telegram.ts       # (removed — moved to src/telegram/)
│   │   └── jwt.ts            # signHs256 / verifyHs256 (JWT for download tokens)
│   ├── telegram/             # Telegram bot — split per-tool modules (MCP parity)
│   │   ├── service.ts        # TelegramBotService: webhook entry, registry dispatch, chat-state persistence
│   │   ├── botApi.ts         # Telegram API client + types + helpers (escapeHtml, inlineKeyboard, parseCallbackData…)
│   │   ├── types.ts          # BotToolKit, BotCtx, ChatState, TelegramTool registry interfaces
│   │   ├── menu.ts           # /start menu text + keyboard (composed from tools)
│   │   ├── replyFlow.ts      # Multi-step reply drafts (text + attachments → Resend email)
│   │   ├── notifications.ts  # Outbound pushes: notifyTicketEvent, notifyStatusChange
│   │   └── tools/            # One file per domain; each exports a TelegramTool
│   │       ├── tickets.ts    # /ticket, /unread, history, attachments, status, priority
│   │       ├── licenses.ts   # /licenses, /license, /verify, /create-license, domain/status mgmt
│   │       ├── plugins.ts    # /plugins, /plugin, versions, download links, download logs
│   │       ├── contacts.ts   # /contacts, /contact, + purchase code (Envato verified)
│   │       ├── releases.ts   # /releases, download links, app update logs
│   │       ├── files.ts      # /files — R2 File Manager browse + download links
│   │       ├── monitoring.ts # /stats, /api-logs, /tamper
│   │       └── notifications.ts # /notifs — notification feed + mark read
│   ├── mcp/
│   │   └── index.ts          # MCP server (51 tools, Streamable HTTP)
│   ├── ai/
│   │   ├── analyze.ts        # OpenAI structured-output client, prompt, injection heuristics, schema validation
│   │   └── ticketAiWorkflow.ts # TicketAiWorkflow (WorkflowEntrypoint): load → analyze → store
│   └── ui/
│       ├── main.tsx           # React entry (BrowserRouter, Toaster)
│       ├── App.tsx            # Routes definition
│       ├── index.css          # CSS vars (oklch), Figtree, shadcn theme
│       ├── components/
│       │   ├── Layout.tsx     # Sidebar + avatar menu + mobile hamburger
│       │   ├── ProtectedRoute.tsx
│       │   ├── Skeletons.tsx  # DashboardSkeleton, TableSkeleton, CardTableSkeleton
│       │   ├── MarkdownView.tsx # react-markdown renderer (GFM + highlight + copy button)
│       │   └── ui/            # shadcn components
│       └── pages/
│           ├── Login.tsx      # Email/password, rememberMe
│           ├── Dashboard.tsx  # Recharts, stats cards, recent activity
│           ├── Licenses.tsx   # CRUD, search, sort, pagination
│           ├── Plugins.tsx    # List grouped by slug
│           ├── PluginDetail.tsx # Per-plugin versions
│           ├── FileManager.tsx # R2 file manager (list/upload/folder/preview/delete)
│           ├── MarkdownPreview.tsx # Rendered .md preview page (react-markdown)
│           ├── Logs.tsx       # API logs + tamper + MCP audit logs tabs
│           ├── Mcp.tsx        # MCP documentation page
│           ├── Telegram.tsx   # Telegram bot admin (config, webhook logs, bot logs)
│           └── Profile.tsx    # User info, password change
├── migrations/                # D1 SQL migrations
├── scripts/
│   └── patch-wrangler.js      # Post-build: inject run_worker_first
├── public/
│   └── favicon.png            # 1024x1024 PNG
├── docs/
│   ├── APP_UPDATE_SPEC.md     # Auto-update system specification (for Laravel team)
│   └── TICKET_SUPPORT_SPEC.md # Email-based ticket support system specification
├── wrangler.jsonc             # Cloudflare Worker config
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Production Environment

| Item | Value |
|---|---|
| **Domain** | `api.chatloka.net` |
| **Base URL** | `https://api.chatloka.net` |
| **Admin Panel** | `https://api.chatloka.net/manage` |
| **MCP Endpoint** | `https://api.chatloka.net/mcp` (Streamable HTTP, Bearer token auth) |
| **Public API** | `https://api.chatloka.net/api/validate`, `/activate`, `/deactivate`, `/verify` |
| **Plugin Downloads** | `https://api.chatloka.net/downloads/` |
| **R2 Path Format** | Plugin: `plugins/{slug}/{version}/{slug}-{version}.zip` · App: `app-releases/{version}/chatloka-{version}.zip` |

---

## API Endpoints

### Public (no auth)
| Method | Path | Description | Rate Limit |
|---|---|---|---|
| GET | `/api/validate` | Validate license | 30/min |
| GET | `/api/activate` | Activate license | 10/min |
| GET | `/api/deactivate` | Deactivate license | 10/min |
| GET | `/api/verify` | Verify purchase code via Envato | 10/min |
| GET | `/api/plugins/token` | Get plugin download token | 20/min |
| GET | `/downloads/:token` | Download plugin zip from R2 | 60/min |
| PUT | `/api/uploads/:token` | Upload release zip to R2 (one-time signed token via MCP, ≤95 MB; larger files → rclone) | — |
| GET | `/api/files/download/:token` | File Manager download (one-time signed token via MCP, 1hr) | — |
| GET | `/api/stats` | Public stats (license counts, tamper, recent) | — |
| POST | `/api/webhooks/telegram` | Telegram bot webhook (secret-token verified) | — |
| POST | `/api/webhooks/resend` | Resend inbound email webhook (svix verified) | — |
| GET | `/api/auth/*` | Better Auth public endpoints | — |

### Admin (session cookie required)
| Method | Path | Description |
|---|---|---|
| GET | `/manage/api/stats` | Dashboard stats (includes apiStats, recentLicenses, latestTamper) |
| GET | `/manage/api/licenses` | List all licenses (search, sort, page, limit) |
| POST | `/manage/api/licenses` | Create license (purchase_code, domain, license_type, buyer info) |
| PATCH | `/manage/api/licenses/:id` | Update license domain/status |
| DELETE | `/manage/api/licenses/:id` | Delete license |
| GET | `/manage/api/plugins` | List all plugins (search, page, limit) |
| GET | `/manage/api/plugins/:slug` | Plugin detail with versions |
| GET | `/manage/api/plugins/:slug/download` | Generate download link (?version=) |
| GET | `/manage/api/logs` | API request logs (search, sort, endpoint, status, page, limit) |
| GET | `/manage/api/logs/stats` | 24h API stats |
| GET | `/manage/api/logs/endpoints` | Distinct endpoints |
| GET | `/manage/api/logs/tamper` | Tamper detection logs (search, sort, page, limit) |
| GET | `/manage/api/logs/webhooks` | Webhook payload logs (provider, handled, page, limit) |
| GET | `/manage/api/mcp-logs` | MCP audit logs (method, tool, client, search, sort, page, limit) |
| GET | `/manage/api/files` | File Manager list (path, search, cursor, limit) |
| POST | `/manage/api/files/folder` | Create folder (zero-byte placeholder object) |
| DELETE | `/manage/api/files` | Delete file or folder (recursive) |
| GET | `/manage/api/files/download` | Stream a file (`?key=`, `mode=inline|attachment`) |
| POST | `/manage/api/files/upload` | Upload file (multipart, ≤95 MB, session auth) |
| GET | `/manage/api/telegram/overview` | Telegram bot overview (config, stats, providers, top actions) |
| GET | `/manage/api/telegram/bot-logs` | Telegram bot action logs (action, sort, page, limit) |
| GET | `/manage/api/telegram/webhook-info` | Current Telegram webhook + bot info |
| POST | `/manage/api/telegram/set-webhook` | Register `{base}/api/webhooks/telegram` |
| POST | `/manage/api/telegram/delete-webhook` | Remove the Telegram webhook |
| POST | `/manage/api/telegram/test` | Send a test message to the admin chat |
| GET | `/manage/api/tickets/:ticketNumber/ai-analysis` | AI triage result for a ticket (polled by UI; `analysis: null` if none) |

### MCP (Bearer token required)
| Method | Path | Description |
|---|---|---|
| ALL | `/mcp` | MCP Streamable HTTP endpoint (51 tools) |

---

## MCP Tools (51 total)

### License Management
- `get_licenses` — List all licenses
- `get_license` — Get single license by purchase code
- `create_license` — Create new license
- `update_license_status` — Change status (active/deactivated/suspended)
- `update_license_domain` — Change bound domain
- `verify_purchase_code` — Verify against Envato API
- `get_license_features` — Get features for license type
- `get_validation_logs` — Validation history for a license
- `get_domain_history` — Domain change history for a license

### Plugin Management
- `get_plugins` — List all plugins
- `get_plugin_versions` — Version history for a plugin
- `get_plugin_download_logs` — Download history
- `generate_plugin_download_link` — Generate JWT download token (1hr, single-use)
- `generate_plugin_upload_link` — Step 1 of release: one-time signed PUT URL (≤95 MB) or rclone instructions (>95 MB)
- `publish_plugin_version` — Step 2 of release (manual): register uploaded zip as latest (checksum required)

### Ticket Management (Support)
- `get_tickets` — List tickets (status/category/search/sort/pagination + contact badges)
- `get_ticket` — Full ticket detail (messages, attachments, participants, merge context, contact)
- `get_ticket_attachments` — List all attachments across a ticket's messages
- `reply_ticket` — Send email reply via Resend (threading headers, CC participants)
- `update_ticket_status` — Change status (open/pending/closed)
- `update_ticket_priority` — Change priority (low/medium/high)
- `update_ticket_category` — Change category (pre_sale/installation/bug/customization/feature_request/license/billing/other)
- `merge_tickets` — Merge tickets into target or new container ticket
- `get_ticket_stats` — Total/open/pending/closed counts
- `get_ticket_analytics` — First-response/avg-response, per-weekday/hour (WIB), slow gaps
- `get_unread_tickets` — Unread inbox (customer messages not yet seen)
- `mark_tickets_read` — Mark one ticket or all unread tickets read
- `generate_attachment_download_link` — Generate 1hr single-use download link for a ticket attachment

### Contact Management (Users)
- `get_contacts` — List contacts (lead/customer, search, support status)
- `get_contact` — Contact detail (purchases, support expiry, ticket history)
- `add_contact_purchase` — Attach purchase code (+auto Envato verify), promote to customer
- `update_contact_purchase` — Edit purchase (license type, support until, dates)
- `remove_contact_purchase` — Remove purchase (demotes customer back to lead)
- `update_contact` — Update contact name / admin notes

### App Release Management
- `get_app_versions` — List all Chatloka app release versions
- `generate_release_download_link` — Generate 1hr single-use JWT download link for a release
- `generate_app_upload_link` — Step 1 of release: one-time signed PUT URL (≤95 MB) or rclone instructions (>95 MB)
- `publish_app_version` — Step 2 of release (manual): register uploaded zip as latest (checksum required)
- `get_app_update_logs` — Client-side app update logs (success/failure per license)

### Notifications
- `get_notifications` — Admin notification feed + unread count
- `mark_notifications_read` — Mark single or all notifications read

### File Manager (R2)
- `get_files` — List files/folders in R2 (folder-style, recursive search)
- `create_folder` — Create a folder (zero-byte placeholder object)
- `generate_file_upload_link` — Signed PUT URL (≤95 MB) or rclone instructions (>95 MB); no publish step
- `generate_file_download_link` — 1hr single-use download URL
- `delete_file` — Delete file or folder (recursive)

### Monitoring
- `get_api_logs` — API request logs with filtering
- `get_tamper_logs` — Tamper detection logs
- `get_api_stats` — 24h API statistics
- `get_dashboard_stats` — Aggregate dashboard statistics
- `get_mcp_logs` — MCP request/response audit logs (method, tool, params, response, client, session, IP)

---

## Database Schema (D1)

| Table | Purpose |
|---|---|
| `licenses` | License records (purchase_code, domain, status, buyer info) |
| `api_logs` | Request logging (endpoint, status, response_time, IP, user_agent) |
| `tamper_logs` | File integrity check failures |
| `tickets` | Support tickets (ticket_number, from_email, subject, status, priority, category, contact_id, message stats) |
| `ticket_messages` | Ticket thread messages (inbound/outbound, threading headers) |
| `license_domain_history` | Domain change audit trail |
| `plugin_versions` | Plugin version registry (slug, version, checksum, download_count) |
| `plugin_download_logs` | Plugin download history |
| `mcp_servers` | MCP server API keys |
| `webhook_logs` | Raw webhook payloads (telegram + resend) |
| `telegram_bot_logs` | Telegram bot action audit trail |
| `telegram_chat_state` | Per-chat multi-step state (reply flow) |
| `mcp_logs` | MCP request/response audit logs (method, tool, params, response, client, session, IP) |
| `ticket_ai_analyses` | AI triage per ticket (status pending→processing→completed/failed, summary, category, priority, sentiment, key_points/suggested_steps/tags JSON, confidence, injection flags, tokens/cost telemetry) |
| `user` | Better Auth users |
| `session` | Better Auth sessions |
| `account` | Better Auth accounts |
| `verification` | Better Auth verifications |

---

## Cloudflare Secrets (set via `wrangler secret`)

| Secret | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Better Auth session signing key |
| `ENVATO_PERSONAL_TOKEN` | Envato API token for purchase verification |
| `DOWNLOAD_TOKEN_SECRET` | HMAC key for plugin download JWT tokens |
| `RSA_PRIVATE_KEY` | RSA key for token signing |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret (currently unused — captcha disabled) |
| `MCP_API_KEY` | Bearer token for MCP endpoint authentication |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (`@chatlokaapibot`) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token sent in `X-Telegram-Bot-Api-Secret-Token` header |
| `OPENAI_API_KEY` | OpenAI API key for ticket AI triage (`gpt-5.4-mini`). Optional — analysis steps fail gracefully without it |

---

## Cloudflare Vars (in wrangler.jsonc)

| Var | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `API_BASE_URL` | `https://api.chatloka.net` |
| `ENVATO_API_URL` | `https://envatoapi.chatloka.net/v3/market` |
| `BETTER_AUTH_URL` | `https://api.chatloka.net` |
| `TURNSTILE_SITE_KEY` | `0x4AAAAAADbNEcF-YAzBslQ5k-DCBhlyqFM` |
| `TELEGRAM_ADMIN_CHAT_ID` | `7463670864` (admin chat — satu-satunya chat yang mengaktifkan bot) |
| `TELEGRAM_BOT_USERNAME` | `chatlokaapibot` |

---

## Rate Limits (Cloudflare Ratelimiting)

| Name | Limit | Period |
|---|---|---|
| RL_VALIDATE | 30 | 60s |
| RL_ACTIVATE | 10 | 60s |
| RL_VERIFY | 10 | 60s |
| RL_DEACTIVATE | 10 | 60s |
| RL_PLUGIN_TOKEN | 20 | 60s |
| RL_PLUGIN_DOWNLOAD | 60 | 60s |

---

## Code Conventions

### General
- All code in TypeScript strict mode.
- Never use `console.log` in production code (use `console.error` only for real errors).
- Always use `const` over `let`. No `var`.

### Backend (Hono)
- Routes defined with `new Hono<{ Bindings: CloudflareBindings }>()`.
- Admin routes use session middleware: `c.get("session")` returns `{ user, session }` (NOT `{ session: { user } }`).
- D1 queries use `c.env.DB.prepare().bind().all()` pattern.
- Error responses: `c.json({ error: { message: "..." } }, statusCode)`.

### Telegram Bot (src/telegram/)
- The bot is a registry of `TelegramTool` modules (one file per domain in `src/telegram/tools/`). `service.ts` merges their `commands` / `callbacks` / `prompts` / `menuCommands` / `menuButtons` into dispatch maps — never add new cases to `service.ts` directly; add a tool file instead.
- Tools receive a `BotCtx { kit, chatId, reply, edit, log }`; `kit` is the `BotToolKit` (env, db, bucket, api + all services + chat-state/log helpers). Do NOT instantiate services inside tools — use the kit.
- Callback data is `action:part1:part2` — parse with `parseCallbackData`; every inline button row should include a way back (usually `menu`).
- Multi-step typed-input flows (e.g. license domain change, reply drafts) store a `ChatState` via `kit.setChatState(chatId, { action, data })`; the prompt handler is looked up by `action` and receives the raw message. Always `clearChatState` when the flow ends (also on `cancel`).
- All text sent with `parse_mode: 'HTML'` must be escaped via `escapeHtml` (user-controlled values included).
- Only the chat in `TELEGRAM_ADMIN_CHAT_ID` is allowed; other chats are logged `ignored_chat`.

### Frontend (React)
- **Always use `@tabler/icons-react`** for icons. Do NOT use `lucide-react`.
- Use shadcn components from `@/components/ui/`.
- Use `sonner` for toast notifications (`toast.success()`, `toast.error()`).
- Use Skeleton components from `@/components/Skeletons.tsx` for loading states. Do NOT use spinners.
- All page titles use `text-foreground` class.
- All clickable elements must have `cursor-pointer`.
- Dark mode is forced (`<html class="dark">`).
- Font: Figtree Variable (`@fontsource-variable/figtree`).
- CSS uses oklch format for color variables.
- Select components use shadcn `Select` (base-ui, `onValueChange` passes `string | null`).
- Checkbox components use shadcn `Checkbox`.
- Textarea components use shadcn `Textarea`.

### Styling
- Tailwind CSS v4.3+ (utility classes).
- shadcn preset `b377ZhrwLQ` (blue primary theme).
- `--border: oklch(1 0 0 / 10%)` — subtle dark borders.
- `--input: oklch(1 0 0 / 15%)` — subtle dark input borders.
- Dark scrollbar: `::-webkit-scrollbar` with `oklch(1 0 0 / 20%)` thumb, `scrollbar-width: thin`.

---

## Common Issues & Solutions

### Vite strips `run_worker_first` from wrangler.jsonc
The Cloudflare Vite plugin removes non-standard fields. Solution: `scripts/patch-wrangler.js` re-adds it post-build. Do NOT put `run_worker_first` directly in `wrangler.jsonc`.

### Adding new worker routes (CRITICAL)
When adding a new URL route that must be handled by the worker (e.g., `/mcp`, `/downloads/*`, `/api/*`), you MUST add it to the `run_worker_first` array in **`scripts/patch-wrangler.js`** — NOT in `wrangler.jsonc` (Vite strips it). If a route is not in `run_worker_first`, requests to that path will fall through to the SPA asset handler and return the SPA HTML instead of the worker response.

Current `run_worker_first` entries:
```js
run_worker_first: ["/api/*", "/manage/api/*", "/downloads/*", "/mcp"]
```

### MCP returns 405 Method Not Allowed
`/mcp` must be in the `run_worker_first` array in `scripts/patch-wrangler.js`. All HTTP methods (GET, POST, etc.) must be handled — use `app.all('/mcp')`.

### MCP audit logs
Every `/mcp` request (authorized or not) is written to `mcp_logs`: JSON-RPC method, tool name, request params, response body, HTTP status, duration, client info (from `initialize` clientInfo), session id, IP, user agent. Payloads are truncated at 20 KB (`params`/`response`) or 200 chars (short fields) with a `…[truncated]` suffix. Viewable via the Logs page (MCP Logs tab), `GET /manage/api/mcp-logs`, or the `get_mcp_logs` MCP tool. Unauthorized attempts are stored with method `unauthorized` and status 401.

### Releasing a plugin or app version via MCP
Upload and publish are TWO separate manual steps (never combined):
1. `generate_plugin_upload_link` / `generate_app_upload_link` — returns a one-time signed PUT URL (`PUT /api/uploads/:token`). Files ≤ 95 MB stream through the worker via `curl -T` (optional `X-Checksum-SHA256` header → R2 validates); files > 95 MB get rclone/AWS CLI instructions to upload straight to R2 (S3 multipart, resumable).
2. `publish_plugin_version` / `publish_app_version` — always manual, `checksum` is REQUIRED (SHA-256 hex, compute with `sha256sum` where the zip lives). Verifies the object exists in R2 (`bucket.head`), then inserts the DB row and marks it latest. Checksum is used for tamper-detection integrity checks.

### File Manager (internal files)
General R2 objects (specs, docs, raw source, custom solutions) live under the `files/` prefix. They are NOT registered in any DB table — the File Manager is a pure R2 view. There is no publish step: `generate_file_upload_link` returns a one-time signed PUT URL (`PUT /api/uploads/:token` with `target: "file"`), the file is live as soon as the curl finishes. Folders are zero-byte placeholder objects with a trailing `/` (standard R2 convention; shown via `delimitedPrefixes` when listing with delimiter `/`). Delete a folder by passing a key ending in `/` (recursive, batch deletes of ≤1000 keys). UI uploads cap at 95 MB (Cloudflare request-body limit is 100 MB); larger files use the rclone workflow. Files with `.md`/`.markdown` extension open in the dedicated rendered markdown page (`/manage/files/preview?key=...&name=...`, powered by `react-markdown` + `remark-gfm` + `rehype-highlight` with a copy button on code blocks).

### Telegram webhook not firing
`/api/webhooks/telegram` lives under `/api/*` (already in `run_worker_first`), so it reaches the worker. The bot only reacts to the chat id in `TELEGRAM_ADMIN_CHAT_ID`; other chats are logged as `ignored_chat`. Register webhook via the admin panel (Telegram page → Register Webhook) or the Bot API `setWebhook` with the `X-Telegram-Bot-Api-Secret-Token` header matching `TELEGRAM_WEBHOOK_SECRET`.

### Ticket AI analysis (Cloudflare Workflows)
When a new ticket arrives at `/api/webhooks/resend`, the worker fires `TICKET_AI_WORKFLOW.create({ params: { ticket_id } })` inside `executionCtx.waitUntil` (row `ticket_ai_analyses` inserted as `pending` first). The workflow (`src/ai/ticketAiWorkflow.ts`, binding `TICKET_AI_WORKFLOW` → class `TicketAiWorkflow`) runs 4 steps: upsert `processing` + instance id → load ticket + messages (sleeps 10 s and re-reads if the ticket has no messages yet) → OpenAI `gpt-5.4-mini` analysis (`reasoning_effort: low`, structured outputs, retries 2× with 5 s + exponential backoff, 15 min timeout) → store `completed`/`failed`. On completion the workflow also auto-sets the ticket's `category` column (enum: pre_sale/installation/bug/customization/feature_request/license/billing/other — shared with the admin panel and MCP `update_ticket_category`; admins can override). The UI polls `/manage/api/tickets/:ticketNumber/ai-analysis` every 5 s while status is pending/processing. Guardrails (in `src/ai/analyze.ts`): ticket text is wrapped in `<ticket_data>` delimiters and declared untrusted data in the system prompt; `scanForInjection` flags ≥2 distinct heuristic patterns (stored as `heuristic_injection`); deterministic `validateAnalysis` rejects non-enum values; the model gets no tools. Missing `OPENAI_API_KEY` fails the analyze step gracefully (row → `failed`, UI shows the error).

### D1 schema changes not reflected
Better Auth calls `getMigrations()` before each auth handler request. D1 migrations must be applied via `wrangler d1 migrations apply chatloka`.

### Better Auth session response format
Returns `{ user: {...}, session: {...} }` — NOT `{ session: { user: {...} } }`.

### SPA routing
Cloudflare assets use `not_found_handling: "single-page-application"`. The worker handles `/api/*`, `/manage/api/*`, `/downloads/*`, `/mcp` via `run_worker_first`. Everything else falls through to SPA.

---

## Git Workflow

- **Branch**: `main` (production, auto-deploys on push)
- **Remote**: `origin` → `https://github.com/chatloka/chatlokaapi.git`
- **Never force-push** to `main`.
- **Never commit without user approval.** Always ask first.
- **Run `npm run typecheck && npm run lint`** before every commit.
- Keep commits atomic and messages descriptive.

---

## Admin Credentials (for reference, do not commit)

- **Email**: `cs@chatloka.net`
- **Password**: `Ewb@Bo9M95`
- **Name**: `Chatloka`
- **User ID**: `24DFvYD5ElhufK0C0MZkJ2Ci8yKIUy9l`

---

## MCP Client Configuration

The MCP server uses **Streamable HTTP transport** at `https://api.chatloka.net/mcp` with Bearer token authentication. Example configs:

### OpenCode (`~/.config/opencode/opencode.jsonc`)
```json
"mcp": {
  "chatloka": {
    "type": "streamable-http",
    "url": "https://api.chatloka.net/mcp",
    "headers": { "Authorization": "Bearer <MCP_API_KEY>" }
  }
}
```

### Claude Code / Kilo Code
```json
{
  "mcpServers": {
    "chatloka": {
      "type": "streamable-http",
      "url": "https://api.chatloka.net/mcp",
      "headers": { "Authorization": "Bearer <MCP_API_KEY>" }
    }
  }
}
```

### Claude Desktop / VS Code
```json
{
  "mcpServers": {
    "chatloka": {
      "transport": "http",
      "url": "https://api.chatloka.net/mcp",
      "headers": { "Authorization": "Bearer <MCP_API_KEY>" }
    }
  }
}
```

---

## Deployment

1. `npm run typecheck && npm run lint` — verify no errors
2. Get user approval to commit and push
3. `git add -A && git commit -m "..." && git push`
4. Auto-deploys to Cloudflare Workers (~90 seconds)
5. Verify at `https://api.chatloka.net/manage`
