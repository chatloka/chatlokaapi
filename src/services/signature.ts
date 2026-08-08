function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n')
  const b64 = normalized.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Key material is stable per isolate — import once, reuse across requests.
const keyCache = new Map<string, Promise<CryptoKey>>()

function getPrivateKey(pem: string): Promise<CryptoKey> {
  const cached = keyCache.get(pem)
  if (cached) return cached
  const imported = crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  ).catch((err) => {
    keyCache.delete(pem)
    throw err
  })
  keyCache.set(pem, imported)
  return imported
}

export class SignatureService {
  constructor(private privateKeyPem: string) {}

  private async sign(data: unknown): Promise<string> {
    const payload = JSON.stringify(data)
    const key = await getPrivateKey(this.privateKeyPem)

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(payload))
    return arrayBufferToBase64(signature)
  }

  async createSignedResponse<T>(data: T): Promise<{ data: T; signature: string }> {
    const signature = await this.sign(data)
    return { data, signature }
  }
}
