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
| **R2** | — | Object storage for plugin .zip files (binding: `PLUGINS_BUCKET`) |
| **MCP SDK** | 2.0+ | Model Context Protocol server (`@modelcontextprotocol/server` + `@modelcontextprotocol/hono`) |
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
│   │   ├── telegram.ts       # Telegram bot (Bot API client + TelegramBotService)
│   │   └── jwt.ts            # signHs256 / verifyHs256 (JWT for download tokens)
│   ├── mcp/
│   │   └── index.ts          # MCP server (40 tools, Streamable HTTP)
│   └── ui/
│       ├── main.tsx           # React entry (BrowserRouter, Toaster)
│       ├── App.tsx            # Routes definition
│       ├── index.css          # CSS vars (oklch), Figtree, shadcn theme
│       ├── components/
│       │   ├── Layout.tsx     # Sidebar + avatar menu + mobile hamburger
│       │   ├── ProtectedRoute.tsx
│       │   ├── Skeletons.tsx  # DashboardSkeleton, TableSkeleton, CardTableSkeleton
│       │   └── ui/            # shadcn components
│       └── pages/
│           ├── Login.tsx      # Email/password, rememberMe
│           ├── Dashboard.tsx  # Recharts, stats cards, recent activity
│           ├── Licenses.tsx   # CRUD, search, sort, pagination
│           ├── Plugins.tsx    # List grouped by slug
│           ├── PluginDetail.tsx # Per-plugin versions
│           ├── Logs.tsx       # API logs + tamper logs tabs
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
| **R2 Path Format** | `plugins/releases/{slug}/{slug}-{version}.zip` |

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
| GET | `/manage/api/telegram/overview` | Telegram bot overview (config, stats, providers, top actions) |
| GET | `/manage/api/telegram/bot-logs` | Telegram bot action logs (action, sort, page, limit) |
| GET | `/manage/api/telegram/webhook-info` | Current Telegram webhook + bot info |
| POST | `/manage/api/telegram/set-webhook` | Register `{base}/api/webhooks/telegram` |
| POST | `/manage/api/telegram/delete-webhook` | Remove the Telegram webhook |
| POST | `/manage/api/telegram/test` | Send a test message to the admin chat |
| GET | `/manage/api/mcp-servers` | MCP server API keys |

### MCP (Bearer token required)
| Method | Path | Description |
|---|---|---|
| ALL | `/mcp` | MCP Streamable HTTP endpoint (40 tools) |

---

## MCP Tools (40 total)

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

### Ticket Management (Support)
- `get_tickets` — List tickets (status/search/sort/pagination + contact badges)
- `get_ticket` — Full ticket detail (messages, attachments, participants, merge context, contact)
- `get_ticket_attachments` — List all attachments across a ticket's messages
- `reply_ticket` — Send email reply via Resend (threading headers, CC participants)
- `update_ticket_status` — Change status (open/pending/closed)
- `update_ticket_priority` — Change priority (low/medium/high)
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
- `get_app_update_logs` — Client-side app update logs (success/failure per license)

### Notifications
- `get_notifications` — Admin notification feed + unread count
- `mark_notifications_read` — Mark single or all notifications read

### Monitoring
- `get_api_logs` — API request logs with filtering
- `get_tamper_logs` — Tamper detection logs
- `get_api_stats` — 24h API statistics
- `get_dashboard_stats` — Aggregate dashboard statistics

---

## Database Schema (D1)

| Table | Purpose |
|---|---|
| `licenses` | License records (purchase_code, domain, status, buyer info) |
| `api_logs` | Request logging (endpoint, status, response_time, IP, user_agent) |
| `tamper_logs` | File integrity check failures |
| `license_domain_history` | Domain change audit trail |
| `plugin_versions` | Plugin version registry (slug, version, checksum, download_count) |
| `plugin_download_logs` | Plugin download history |
| `mcp_servers` | MCP server API keys |
| `webhook_logs` | Raw webhook payloads (telegram + resend) |
| `telegram_bot_logs` | Telegram bot action audit trail |
| `telegram_chat_state` | Per-chat multi-step state (reply flow) |
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

### Telegram webhook not firing
`/api/webhooks/telegram` lives under `/api/*` (already in `run_worker_first`), so it reaches the worker. The bot only reacts to the chat id in `TELEGRAM_ADMIN_CHAT_ID`; other chats are logged as `ignored_chat`. Register webhook via the admin panel (Telegram page → Register Webhook) or the Bot API `setWebhook` with the `X-Telegram-Bot-Api-Secret-Token` header matching `TELEGRAM_WEBHOOK_SECRET`.

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
