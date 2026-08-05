# ChatLoka Ticket Support System — Email-Based

> **Status**: Planning Phase
> **Author**: AI Agent (researched from Resend official docs)
> **Date**: 2026-08-05

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [R2 Storage Structure](#r2-storage-structure)
5. [API Endpoints](#api-endpoints)
6. [Webhook Flow](#webhook-flow)
7. [Email Threading](#email-threading)
8. [Attachment Handling](#attachment-handling)
9. [Admin UI Requirements](#admin-ui-requirements)
10. [Implementation Checklist](#implementation-checklist)

---

## Overview

ChatLoka Ticket Support System enables users to contact support via email. Every inbound email is automatically converted into a support ticket. Admins can view and reply to tickets from the admin dashboard. Replies are sent via email and threaded using standard email headers.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **Email-based tickets** | Users already use email; no new login required |
| **Resend for email** | Modern API, works with Cloudflare Workers, free tier available |
| **R2 for attachments** | Private storage, scalable, cost-effective |
| **D1 for metadata** | SQLite on Cloudflare, fast queries |
| **Email threading** | `In-Reply-To` + `References` headers for conversation grouping |
| **Webhook verification** | Svix signature verification for security |

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    INBOUND FLOW                             │
│                                                             │
│  User emails support@chatloka.net                           │
│           ↓                                                 │
│  Resend receives → POST /api/webhooks/resend                │
│           ↓                                                 │
│  Verify Svix signature                                      │
│           ↓                                                 │
│  Check if existing thread (In-Reply-To header)              │
│           ↓                                                 │
│  Fetch full email via GET /emails/receiving/:id             │
│           ↓                                                 │
│  Download attachments → Upload to R2                        │
│           ↓                                                 │
│  Create/Update ticket + messages in D1                      │
│           ↓                                                 │
│  Notify admin (optional)                                    │
│           ↓                                                 │
│  Return 200 OK                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    OUTBOUND FLOW                            │
│                                                             │
│  Admin clicks "Reply" in dashboard                          │
│           ↓                                                 │
│  Admin types reply message                                  │
│           ↓                                                 │
│  POST /manage/api/tickets/:id/reply                         │
│           ↓                                                 │
│  Send email via Resend API                                  │
│           ↓                                                 │
│  Include In-Reply-To + References headers                   │
│           ↓                                                 │
│  Store outbound message in D1                               │
│           ↓                                                 │
│  User receives reply in same email thread                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Components

| Component | Technology | Purpose |
|---|---|---|
| **Webhook Endpoint** | Hono (Cloudflare Worker) | Receive inbound email events |
| **Email Service** | Resend API | Send outbound emails |
| **R2 Storage** | Cloudflare R2 | Store email attachments |
| **Database** | Cloudflare D1 | Store ticket metadata |
| **Admin UI** | React SPA | Manage tickets |
| **Notification** | Optional | Email/Slack notification for new tickets |

---

## Database Schema

### Table: `tickets`

```sql
CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_number TEXT NOT NULL UNIQUE,          -- e.g. "TKT-00001"
    purchase_code TEXT,                          -- Linked license (optional)
    domain TEXT,                                 -- Linked domain (optional)
    from_email TEXT NOT NULL,                    -- User's email
    subject TEXT NOT NULL,                       -- Email subject
    status TEXT NOT NULL DEFAULT 'open',         -- open / pending / closed
    priority TEXT DEFAULT 'normal',              -- low / normal / high / urgent
    assigned_to TEXT,                            -- Admin user ID (optional)
    last_message_at TEXT,                        -- Last message timestamp
    message_count INTEGER DEFAULT 0,             -- Total messages
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_from_email ON tickets(from_email);
CREATE INDEX idx_tickets_purchase_code ON tickets(purchase_code);
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX idx_tickets_last_message ON tickets(last_message_at DESC);
CREATE UNIQUE INDEX idx_tickets_number ON tickets(ticket_number);
```

### Table: `ticket_messages`

```sql
CREATE TABLE ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,                  -- FK to tickets
    direction TEXT NOT NULL,                     -- inbound / outbound
    from_email TEXT NOT NULL,                    -- Sender email
    to_email TEXT NOT NULL,                      -- Recipient email
    subject TEXT,                                -- Email subject
    body_html TEXT,                              -- HTML content
    body_text TEXT,                              -- Plain text content
    resend_email_id TEXT,                        -- Resend email ID
    message_id TEXT,                             -- RFC Message-ID header
    in_reply_to TEXT,                            -- In-Reply-To header
    references TEXT,                             -- References header
    has_attachments INTEGER DEFAULT 0,           -- Boolean flag
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_direction ON ticket_messages(direction);
CREATE INDEX idx_ticket_messages_message_id ON ticket_messages(message_id);
CREATE INDEX idx_ticket_messages_created ON ticket_messages(created_at);
```

### Table: `ticket_attachments`

```sql
CREATE TABLE ticket_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_message_id INTEGER NOT NULL,         -- FK to ticket_messages
    ticket_id INTEGER NOT NULL,                  -- FK to tickets (for quick access)
    filename TEXT NOT NULL,                      -- Original filename
    content_type TEXT NOT NULL,                  -- MIME type
    file_size INTEGER,                           -- Size in bytes
    r2_path TEXT NOT NULL,                       -- R2 object key
    resend_attachment_id TEXT,                   -- Resend attachment ID
    content_id TEXT,                             -- For inline images (CID)
    content_disposition TEXT,                    -- inline / attachment
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_ticket_attachments_message ON ticket_attachments(ticket_message_id);
CREATE INDEX idx_ticket_attachments_ticket ON ticket_attachments(ticket_id);
```

### Table: `ticket_email_threads`

```sql
CREATE TABLE ticket_email_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,                  -- FK to tickets
    message_id TEXT NOT NULL,                    -- RFC Message-ID
    parent_message_id TEXT,                      -- In-Reply-To value
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_ticket_threads_ticket ON ticket_email_threads(ticket_id);
CREATE INDEX idx_ticket_threads_message_id ON ticket_email_threads(message_id);
CREATE UNIQUE INDEX idx_ticket_threads_msg_unique ON ticket_email_threads(message_id);
```

---

## R2 Storage Structure

```
PLUGINS_BUCKET (chatlokaapi)
├── plugins/                          # Existing plugin zips
├── app-releases/                     # Existing app releases
└── ticket-attachments/               # NEW: Email attachments
    └── {ticket_number}/
        └── {message_id}/
            ├── screenshot.png
            ├── document.pdf
            └── ...
```

**Example:**
```
ticket-attachments/TKT-00001/msg_abc123/screenshot.png
ticket-attachments/TKT-00001/msg_abc123/document.pdf
ticket-attachments/TKT-00002/msg_def456/invoice.pdf
```

**Why this structure?**
- Easy to cleanup when ticket is deleted
- Organized by ticket number for quick access
- Message ID subfolder prevents filename conflicts
- Private bucket = not publicly accessible

---

## API Endpoints

### Webhook Endpoint (Public)

#### 1. Resend Webhook Receiver

```
POST /api/webhooks/resend
```

**Headers:**
- `Content-Type: application/json`
- `svix-id: <event-id>`
- `svix-timestamp: <timestamp>`
- `svix-signature: <signature>`

**Request Body (email.received):**
```json
{
  "type": "email.received",
  "created_at": "2026-02-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "created_at": "2026-02-22T23:41:11.894Z",
    "from": "user@example.com",
    "to": ["support@chatloka.net"],
    "message_id": "<111-222-333@email.example.com>",
    "subject": "Help with my license",
    "attachments": [...]
  }
}
```

**Processing:**
1. Verify Svix signature using `RESEND_WEBHOOK_SECRET`
2. Check event type is `email.received`
3. Fetch full email via `GET https://api.resend.com/emails/receiving/{email_id}`
4. Check if reply (has `In-Reply-To` header pointing to existing message)
5. If new thread → Create new ticket
6. If reply → Find existing ticket by message_id
7. Download attachments from Resend → Upload to R2
8. Store message + attachment records in D1
9. Return `200 OK`

**Response:**
```json
{ "received": true }
```

---

### Admin Endpoints (Session Required)

#### 2. List Tickets

```
GET /manage/api/tickets?page=1&limit=20&status=open&search=license
```

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 20, max: 100) |
| `status` | string | Filter: `open`, `pending`, `closed`, or `all` |
| `search` | string | Search in subject, from_email, ticket_number |
| `sort` | string | `newest` (default) or `oldest` |

**Response:**
```json
{
  "tickets": [
    {
      "id": 1,
      "ticket_number": "TKT-00001",
      "from_email": "user@example.com",
      "subject": "Help with my license",
      "status": "open",
      "priority": "normal",
      "message_count": 3,
      "last_message_at": "2026-08-05T10:30:00Z",
      "created_at": "2026-08-05T09:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

#### 3. Get Ticket Detail

```
GET /manage/api/tickets/:ticketNumber
```

**Response:**
```json
{
  "ticket": {
    "id": 1,
    "ticket_number": "TKT-00001",
    "from_email": "user@example.com",
    "subject": "Help with my license",
    "status": "open",
    "priority": "normal",
    "assigned_to": null,
    "purchase_code": "xxx-xxx-xxx",
    "domain": "example.com",
    "created_at": "2026-08-05T09:00:00Z"
  },
  "messages": [
    {
      "id": 1,
      "direction": "inbound",
      "from_email": "user@example.com",
      "to_email": "support@chatloka.net",
      "subject": "Help with my license",
      "body_html": "<p>Hi, I need help...</p>",
      "body_text": "Hi, I need help...",
      "has_attachments": true,
      "created_at": "2026-08-05T09:00:00Z",
      "attachments": [
        {
          "id": 1,
          "filename": "screenshot.png",
          "content_type": "image/png",
          "file_size": 4096,
          "download_url": "/manage/api/tickets/attachments/1"
        }
      ]
    },
    {
      "id": 2,
      "direction": "outbound",
      "from_email": "support@chatloka.net",
      "to_email": "user@example.com",
      "subject": "Re: Help with my license",
      "body_html": "<p>Thanks for reaching out...</p>",
      "body_text": "Thanks for reaching out...",
      "has_attachments": false,
      "created_at": "2026-08-05T10:00:00Z",
      "attachments": []
    }
  ]
}
```

---

#### 4. Reply to Ticket

```
POST /manage/api/tickets/:ticketNumber/reply
```

**Request Body:**
```json
{
  "body_html": "<p>Thanks for reaching out. Here's the solution...</p>",
  "body_text": "Thanks for reaching out. Here's the solution...",
  "attachments": [
    {
      "filename": "solution.pdf",
      "content": "base64-encoded-content",
      "content_type": "application/pdf"
    }
  ]
}
```

**Processing:**
1. Get ticket and last message
2. Build `In-Reply-To` header from last message's `message_id`
3. Build `References` header from all previous message_ids
4. Send email via Resend API:
   ```typescript
   resend.emails.send({
     from: 'support@chatloka.net',
     to: [ticket.from_email],
     subject: `Re: ${ticket.subject}`,
     html: body_html,
     text: body_text,
     headers: {
       'In-Reply-To': lastMessage.message_id,
       'References': allReferences.join(' '),
     },
     attachments: [...],
   })
   ```
5. Store outbound message in `ticket_messages`
6. Update ticket `last_message_at` and `message_count`
7. Return success

**Response:**
```json
{
  "success": true,
  "message_id": "new-resend-email-id"
}
```

---

#### 5. Update Ticket Status

```
PATCH /manage/api/tickets/:ticketNumber
```

**Request Body:**
```json
{
  "status": "closed",
  "priority": "high",
  "assigned_to": "admin-user-id"
}
```

---

#### 6. Download Attachment

```
GET /manage/api/tickets/attachments/:attachmentId
```

**Response:** Binary file from R2

**Headers:**
- `Content-Type: <attachment-content-type>`
- `Content-Disposition: attachment; filename="<filename>"`

---

#### 7. Get Ticket Stats

```
GET /manage/api/tickets/stats
```

**Response:**
```json
{
  "total": 150,
  "open": 12,
  "pending": 5,
  "closed": 133,
  "avgResponseTime": "2h 30m"
}
```

---

## Webhook Flow

### Signature Verification

```typescript
// Svix signature verification
const payload = await c.req.text()
const svixId = c.req.header('svix-id')
const svixTimestamp = c.req.header('svix-timestamp')
const svixSignature = c.req.header('svix-signature')

// Verify using Web Crypto API (Cloudflare Workers compatible)
async function verifyWebhook(
  payload: string,
  headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string },
  secret: string
): Promise<boolean> {
  const toSign = `${svixId}.${svixTimestamp}.${payload}`
  const secretBytes = new TextEncoder().encode(secret)

  // Remove whsec_ prefix and decode base64
  const keyData = Uint8Array.from(atob(secret.replace('whsec_', '')), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const signatureBytes = Uint8Array.from(
    atob(svixSignature.split(',')[1]),
    c => c.charCodeAt(0)
  )

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(toSign)
  )
}
```

### Processing Logic

```typescript
// Pseudocode for webhook handler
async function handleWebhook(c: Context) {
  // 1. Verify signature
  const isValid = await verifyWebhook(payload, headers, secret)
  if (!isValid) return c.json({ error: 'Invalid signature' }, 401)

  // 2. Parse event
  const event = JSON.parse(payload)
  if (event.type !== 'email.received') return c.json({ received: true })

  // 3. Fetch full email content
  const email = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}` }
  }).then(r => r.json())

  // 4. Check if this is a reply (has In-Reply-To)
  const inReplyTo = email.headers['in-reply-to']
  const references = email.headers['references']

  // 5. Find or create ticket
  let ticket
  if (inReplyTo) {
    // Find existing ticket by message_id
    ticket = await db.prepare(
      'SELECT t.* FROM tickets t JOIN ticket_email_threads te ON t.id = te.ticket_id WHERE te.message_id = ?'
    ).bind(inReplyTo).first()
  }

  if (!ticket) {
    // Create new ticket
    ticket = await createTicket(event.data, email)
  }

  // 6. Download attachments → Upload to R2
  const attachments = await processAttachments(email.attachments, ticket.ticket_number, email.id)

  // 7. Store message
  await storeMessage(ticket.id, email, attachments)

  // 8. Update ticket
  await updateTicket(ticket.id)

  return c.json({ received: true })
}
```

---

## Email Threading

### How Threading Works

1. **User sends email** → Resend receives → Webhook fires
2. **New ticket created** with `message_id` stored in `ticket_email_threads`
3. **Admin replies** → Email sent with `In-Reply-To` header
4. **User replies** → Resend receives → Webhook fires
5. **System checks** `In-Reply-To` header → Finds existing ticket
6. **Message added** to existing ticket (new message, not new ticket)

### Header Setup

```typescript
// When sending reply
const lastMessage = await getLastMessage(ticketId)
const allReferences = await getAllReferences(ticketId)

await resend.emails.send({
  from: 'support@chatloka.net',
  to: [ticket.from_email],
  subject: `Re: ${ticket.subject}`,
  html: replyHtml,
  headers: {
    'In-Reply-To': lastMessage.message_id,
    'References': [...allReferences, lastMessage.message_id].join(' '),
  },
})
```

---

## Attachment Handling

### Inbound Attachments (User → Support)

```
1. Webhook received with attachment metadata
2. Fetch full email via GET /emails/receiving/:id
3. For each attachment:
   a. Download from Resend: GET /emails/receiving/:id/attachments/:attachmentId
   b. Upload to R2: ticket-attachments/{ticketNumber}/{messageId}/{filename}
   c. Store record in ticket_attachments table
```

### Outbound Attachments (Support → User)

```
1. Admin uploads attachment via UI (base64 encoded)
2. Send email via Resend with attachments parameter
3. Store record in ticket_attachments table
4. Optionally upload to R2 for audit trail
```

### R2 Upload

```typescript
// Download from Resend
const attachmentData = await fetch(
  `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
)

// Upload to R2
const r2Path = `ticket-attachments/${ticketNumber}/${messageId}/${filename}`
await env.PLUGINS_BUCKET.put(r2Path, attachmentData.body, {
  httpMetadata: { contentType: contentType },
})

// Store in D1
await db.prepare(
  'INSERT INTO ticket_attachments (ticket_message_id, ticket_id, filename, content_type, file_size, r2_path, resend_attachment_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
).bind(messageId, ticketId, filename, contentType, fileSize, r2Path, attachmentId).run()
```

### R2 Download

```typescript
// Admin downloads attachment
const attachment = await db.prepare(
  'SELECT * FROM ticket_attachments WHERE id = ?'
).bind(attachmentId).first()

const object = await env.PLUGINS_BUCKET.get(attachment.r2_path)
return new Response(object.body, {
  headers: {
    'Content-Type': attachment.content_type,
    'Content-Disposition': `attachment; filename="${attachment.filename}"`,
  },
})
```

---

## Admin UI Requirements

### Page: Tickets List (`/manage/tickets`)

#### Table View
| Column | Description |
|---|---|
| Ticket # | `TKT-00001` |
| From | User email |
| Subject | Email subject |
| Status | Badge: open (green), pending (yellow), closed (gray) |
| Messages | Count |
| Last Activity | Relative time (e.g. "2 hours ago") |

#### Features
- Filter by status (All / Open / Pending / Closed)
- Search by ticket number, subject, or email
- Sort by newest/oldest
- Pagination with page size selector (20/50/100)

### Page: Ticket Detail (`/manage/tickets/:ticketNumber`)

#### Layout
```
┌─────────────────────────────────────────────────────┐
│  Ticket #TKT-00001                    [Status ▼]    │
│  From: user@example.com                             │
│  Subject: Help with my license                      │
│  Created: Aug 5, 2026 9:00 AM                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [Inbound] user@example.com                 │   │
│  │  Aug 5, 2026 9:00 AM                        │   │
│  │                                             │   │
│  │  Hi, I need help with my license.           │   │
│  │  It's not working on my domain.             │   │
│  │                                             │   │
│  │  📎 screenshot.png (4 KB)                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  [Outbound] support@chatloka.net            │   │
│  │  Aug 5, 2026 10:00 AM                       │   │
│  │                                             │   │
│  │  Thanks for reaching out. Can you provide   │   │
│  │  your purchase code?                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Reply                                              │
│  ┌─────────────────────────────────────────────┐   │
│  │  [Rich text editor / Markdown editor]       │   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│  📎 Attach files          [Send Reply]              │
└─────────────────────────────────────────────────────┘
```

#### Features
- Full conversation thread with email styling
- Download attachments from R2
- Reply with rich text / markdown editor
- Attach files (drag & drop or click)
- Change status (open / pending / closed)
- Change priority (low / normal / high / urgent)
- Assign to admin (optional)

---

## Implementation Checklist

### Server Side (Cloudflare Worker — THIS REPO)

- [ ] Create migration `011_tickets.sql`
- [ ] Create migration `012_ticket_messages.sql`
- [ ] Create migration `013_ticket_attachments.sql`
- [ ] Create migration `014_ticket_email_threads.sql`
- [ ] Add Resend service (`src/services/resend.ts`)
- [ ] Add TicketService (`src/services/ticket.ts`)
- [ ] Add webhook endpoint: `POST /api/webhooks/resend`
- [ ] Add admin routes: list, detail, reply, update, download, stats
- [ ] Update `src/types.ts` with new bindings
- [ ] Update `scripts/patch-wrangler.js` if new routes needed

### Admin UI (React — THIS REPO)

- [ ] Create page: `/manage/tickets` (list view)
- [ ] Create page: `/manage/tickets/:ticketNumber` (detail view)
- [ ] Create reply editor with file upload
- [ ] Add attachment download from R2
- [ ] Add ticket status/priority controls
- [ ] Add navigation item to sidebar
- [ ] Add page size selector to tables

### Resend Dashboard Setup (MANUAL)

- [ ] Create Resend account
- [ ] Verify domain (`chatloka.net` or subdomain)
- [ ] Add MX record for receiving
- [ ] Create webhook endpoint (`email.received` event)
- [ ] Copy API key
- [ ] Copy webhook signing secret
- [ ] Set Cloudflare secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`

---

## Error Handling

### Webhook Errors

| Error | Response | Action |
|---|---|---|
| Invalid signature | 401 | Log, return 401 |
| Email fetch failed | 200 | Log error, return 200 (don't retry) |
| R2 upload failed | 200 | Log error, return 200 (retry later) |
| D1 write failed | 200 | Log error, return 200 (retry later) |

**Important:** Always return 200 for webhooks to prevent Resend retries. Log errors for investigation.

### Common Error Responses

| Status | Error | Meaning |
|---|---|---|
| 400 | `invalid_request` | Missing required fields |
| 401 | `unauthorized` | Invalid webhook signature |
| 404 | `ticket_not_found` | Ticket doesn't exist |
| 413 | `file_too_large` | Attachment exceeds size limit |
| 422 | `invalid_format` | Invalid email content |
| 429 | `rate_limited` | Too many requests |

---

## Resend Webhook Payload Reference

### email.received (Inbound)
```json
{
  "type": "email.received",
  "created_at": "2026-02-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "created_at": "2026-02-22T23:41:11.894Z",
    "from": "user@example.com",
    "to": ["support@chatloka.net"],
    "bcc": [],
    "cc": [],
    "received_for": ["forwarded@example.com"],
    "message_id": "<111-222-333@email.example.com>",
    "subject": "Help with my license",
    "attachments": [
      {
        "id": "2a0c9ce0-3112-4728-976e-47ddcd16a318",
        "filename": "screenshot.png",
        "content_type": "image/png",
        "content_disposition": "inline",
        "content_id": "img001"
      }
    ]
  }
}
```

### email.sent (Outbound)
```json
{
  "type": "email.sent",
  "created_at": "2026-02-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "message_id": "<111-222-333@email.example.com>",
    "from": "support@chatloka.net",
    "to": ["user@example.com"],
    "subject": "Re: Help with my license"
  }
}
```

### Retrieve Received Email (Full Content)
```json
{
  "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
  "to": ["support@chatloka.net"],
  "from": "user@example.com",
  "created_at": "2026-04-03T22:13:42.674Z",
  "subject": "Help with my license",
  "html": "<p>Hi, I need help...</p>",
  "text": "Hi, I need help...",
  "headers": {
    "from": "User <user@example.com>",
    "return-path": "user@example.com",
    "in-reply-to": "<prev-message-id>",
    "references": "<ref1> <ref2>"
  },
  "message_id": "<111-222-333@email.example.com>",
  "attachments": [
    {
      "id": "2a0c9ce0-3112-4728-976e-47ddcd16a318",
      "filename": "screenshot.png",
      "content_type": "image/png",
      "size": 4096
    }
  ]
}
```

---

## Notes

### Why Resend?

| Feature | Benefit |
|---|---|
| Cloudflare Workers compatible | Works with our stack |
| Free tier | 100 emails/day, 1000/month |
| Webhook support | Real-time email notifications |
| Email threading | `In-Reply-To` + `References` headers |
| Laravel SDK | Official package for Laravel apps |
| Simple API | Easy to integrate |

### Why R2 for Attachments?

| Feature | Benefit |
|---|---|
| Private by default | No public access |
| S3-compatible | Easy integration |
| Cost-effective | No egress fees |
| Scalable | Handles large files |
| Integration | Already using for plugins |

### Security Considerations

1. **Webhook verification** — Always verify Svix signatures
2. **R2 private** — Attachments not publicly accessible
3. **Admin auth** — All ticket endpoints require session
4. **Rate limiting** — Prevent abuse
5. **File size limits** — Max 10MB per attachment
6. **Email validation** — Verify sender email format

### Cost Estimation

| Service | Free Tier | Paid |
|---|---|---|
| Resend | 100 emails/day | $20/mo for 50K |
| R2 | 10 GB storage | $0.015/GB/month |
| D1 | 5 GB storage | $0.75/GB/month |

---

## Related Documentation

- [Resend Webhooks](https://resend.com/docs/webhooks)
- [Resend Receiving Emails](https://resend.com/docs/dashboard/receiving/introduction)
- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend Laravel SDK](https://github.com/resend/resend-laravel)
- [Svix Webhook Verification](https://docs.svix.com/receiving/verify)
