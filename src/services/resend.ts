import type { CloudflareBindings } from '../types'

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
      from: options.from,
      to: options.to,
      subject: options.subject,
    }

    if (options.cc && options.cc.length > 0) body.cc = options.cc
    if (options.bcc && options.bcc.length > 0) body.bcc = options.bcc
    if (options.html) body.html = options.html
    if (options.text) body.text = options.text
    if (options.reply_to) body.reply_to = options.reply_to
    if (options.headers) body.headers = options.headers
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
    const toSign = `${headers['svix-id']}.${headers['svix-timestamp']}.${payload}`

    // Remove whsec_ prefix and decode base64
    const secretBase64 = this.webhookSecret.replace('whsec_', '')
    const keyData = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    // Get signature (format: "v1,<signature>")
    const svixSignature = headers['svix-signature']
    const signatureParts = svixSignature.split(',')
    if (signatureParts.length < 2) return false

    const signatureBase64 = signatureParts[1]
    const signatureBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0))

    return crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(toSign),
    )
  }
}
