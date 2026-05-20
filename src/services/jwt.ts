function base64UrlEncode(input: Uint8Array): string {
  let s = ''
  for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlFromString(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
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
  const [encodedHeader, encodedPayload, encodedSig] = token.split('.')
  if (!encodedHeader || !encodedPayload || !encodedSig) throw new Error('Malformed token')

  const body = `${encodedHeader}.${encodedPayload}`
  const expectedSig = base64UrlEncode(await hmacSha256(secret, body))
  if (expectedSig !== encodedSig) throw new Error('Invalid signature')

  const payloadJson = atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedPayload.length / 4) * 4, '='))
  const payload = JSON.parse(payloadJson)
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && now > payload.exp) throw new Error('Token expired')

  return payload
}
