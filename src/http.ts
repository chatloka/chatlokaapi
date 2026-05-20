import type { Context } from 'hono'

export function getClientIp(c: Context): string | undefined {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
}
