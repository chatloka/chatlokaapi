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

export class SignatureService {
  constructor(private privateKeyPem: string) {}

  private async sign(data: unknown): Promise<string> {
    const payload = JSON.stringify(data)
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pemToArrayBuffer(this.privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(payload))
    return arrayBufferToBase64(signature)
  }

  async createSignedResponse<T>(data: T): Promise<{ data: T; signature: string }> {
    const signature = await this.sign(data)
    return { data, signature }
  }
}
