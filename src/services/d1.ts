import type { D1Result } from '@cloudflare/workers-types'

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run()
}

export async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>()
  return row ?? null
}

export async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>()
  return (result.results || []) as T[]
}
