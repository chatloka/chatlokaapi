function base64UrlEncode(input: Uint8Array): string {
  let s = ''
  for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlFromString(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecodeToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlDecodeToString(value: string): string {
  const bytes = base64UrlDecodeToBytes(value)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig as ArrayBuffer)
}

export async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlFromString(JSON.stringify(header))
  const encodedPayload = base64UrlFromString(JSON.stringify(payload))
  const body = `${encodedHeader}.${encodedPayload}`
  const signature = await hmacSha256(secret, body)
  return `${body}.${base64UrlEncode(signature)}`
}

export async function verifyHs256(token: string, secret: string): Promise<Record<string, any>> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')
  const [encodedHeader, encodedPayload, encodedSig] = parts

  // Reject non-HS256 algorithms (including alg: none)
  let header: any
  try {
    header = JSON.parse(base64UrlDecodeToString(encodedHeader))
  } catch {
    throw new Error('Invalid token header')
  }
  if (header.alg !== 'HS256') throw new Error('Unsupported algorithm')

  const body = `${encodedHeader}.${encodedPayload}`

  // Timing-safe verification via the WebCrypto HMAC primitive.
  let signatureBytes: Uint8Array<ArrayBuffer>
  try {
    signatureBytes = base64UrlDecodeToBytes(encodedSig)
  } catch {
    throw new Error('Invalid signature')
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(body))
  if (!valid) throw new Error('Invalid signature')

  let payload: Record<string, any>
  try {
    payload = JSON.parse(base64UrlDecodeToString(encodedPayload))
  } catch {
    throw new Error('Invalid token payload')
  }

  // exp is mandatory: tokens without an expiry are rejected outright.
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || now > payload.exp) {
    throw new Error('Token expired')
  }

  return payload
}
