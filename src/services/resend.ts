import type { CloudflareBindings } from '../types'
import { stripControlChars } from './sanitize'

export interface ResendEmailOptions {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html?: string
  text?: string
  reply_to?: string[]
  headers?: Record<string, string>
  attachments?: ResendAttachment[]
}

export interface ResendAttachment {
  filename: string
  content: string
  content_type?: string
}

export interface ResendSendResponse {
  id: string
}

export interface ReceivedEmail {
  id: string
  to: string[]
  from: string
  created_at: string
  subject: string
  html: string | null
  text: string | null
  headers: Record<string, string>
  message_id: string
  attachments: ReceivedEmailAttachment[]
}

export interface SentEmail {
  id: string
  message_id?: string | null
  subject?: string | null
  to?: string[]
  from?: string | null
  created_at?: string | null
}

export interface ReceivedEmailAttachment {
  id: string
  filename: string
  content_type: string
  content_disposition: string | null
  content_id: string | null
  size?: number
}

export class ResendService {
  private apiKey: string
  private webhookSecret: string
  private baseUrl = 'https://api.resend.com'

  constructor(env: CloudflareBindings) {
    this.apiKey = env.RESEND_API_KEY
    this.webhookSecret = env.RESEND_WEBHOOK_SECRET
  }

  async sendEmail(options: ResendEmailOptions): Promise<ResendSendResponse> {
    const body: Record<string, unknown> = {
      // Defense in depth at the service boundary: strip CR/LF and other
      // control characters that could smuggle header/body separators into
      // user-influenced fields.
      from: stripControlChars(options.from),
      to: options.to,
      subject: stripControlChars(options.subject),
    }

    if (options.cc && options.cc.length > 0) body.cc = options.cc
    if (options.bcc && options.bcc.length > 0) body.bcc = options.bcc
    if (options.html) body.html = options.html
    if (options.text) body.text = options.text
    if (options.reply_to) body.reply_to = options.reply_to
    if (options.headers) {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(options.headers)) {
        headers[stripControlChars(key)] = stripControlChars(value)
      }
      body.headers = headers
    }
    if (options.attachments) {
      body.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.content_type,
      }))
    }

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<ResendSendResponse>
  }

  async getReceivedEmail(emailId: string): Promise<ReceivedEmail> {
    const response = await fetch(`${this.baseUrl}/emails/receiving/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<ReceivedEmail>
  }

  async getSentEmail(emailId: string): Promise<SentEmail> {
    const response = await fetch(`${this.baseUrl}/emails/${emailId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<SentEmail>
  }

  async getAttachmentDownloadUrl(emailId: string, attachmentId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/emails/receiving/${emailId}/attachments/${attachmentId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${error}`)
    }

    const data = await response.json() as { download_url: string }
    return data.download_url
  }

  async verifyWebhook(
    payload: string,
    headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string }
  ): Promise<boolean> {
    const svixId = headers['svix-id'] || ''
    const svixTimestamp = headers['svix-timestamp'] || ''
    const svixSignature = headers['svix-signature'] || ''
    if (!svixId || !svixTimestamp || !svixSignature) return false

    // Freshness check: svix-timestamp is unix seconds since epoch. Reject
    // timestamps more than 300 s away from now so captured webhooks cannot
    // be replayed later.
    const timestampSeconds = parseInt(svixTimestamp, 10)
    if (!Number.isFinite(timestampSeconds)) return false
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSeconds - timestampSeconds) > 300) return false

    const toSign = `${svixId}.${svixTimestamp}.${payload}`

    // Remove whsec_ prefix and decode base64
    const secretBase64 = this.webhookSecret.replace('whsec_', '')
    let keyData: Uint8Array<ArrayBuffer>
    try {
      const raw = atob(secretBase64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      keyData = bytes
    } catch {
      return false
    }

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    // The svix-signature header is a space-delimited list of "v1,<base64>"
    // entries (multiple entries appear during key rotation). Any entry whose
    // version is 'v1' and whose HMAC matches passes. crypto.subtle.verify is
    // constant-time.
    const entries = svixSignature.split(' ')
    for (const entry of entries) {
      const [version, signatureBase64] = entry.split(',')
      if (version !== 'v1' || !signatureBase64) continue
      let signatureBytes: Uint8Array<ArrayBuffer>
      try {
        const raw = atob(signatureBase64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        signatureBytes = bytes
      } catch {
        continue
      }
      const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        new TextEncoder().encode(toSign),
      )
      if (valid) return true
    }

    return false
  }
}
