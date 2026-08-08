import type { Context } from 'hono'

export function getClientIp(c: Context): string | undefined {
  // Trust only the IP set by Cloudflare itself. x-forwarded-for / x-real-ip
  // are attacker-controllable when sent by arbitrary clients and must never
  // be used for rate limiting, audit logs or abuse decisions.
  return c.req.header('cf-connecting-ip') || undefined
}
