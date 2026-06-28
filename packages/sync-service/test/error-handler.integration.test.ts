import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import type { AccessLogEntry } from '../src/metrics.js'

// The error envelope is consistent and SAFE: 5xx never leak internal detail to
// the client (the real cause is kept server-side in the access log, keyed by
// request id), 4xx keep their helpful validation message, and every error body
// carries statusCode + requestId for support correlation.

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const log: AccessLogEntry[] = []
  const store = new OpStore(pool)
  const app = buildApp({ store, onAccessLog: (e) => log.push(e) })
  return { app, store, log }
}

describe('error handler', () => {
  it('sanitizes a 5xx: generic message to the client, real cause only in the access log', async () => {
    const { app, store, log } = await harness()
    // Force an internal failure whose message would be sensitive if leaked.
    ;(store as unknown as { insertOps: () => Promise<string[]> }).insertOps = async () => {
      throw new Error('boom: connection to db-internal:5432 failed (password=hunter2)')
    }
    const res = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c', ops: [] } })
    expect(res.statusCode).toBe(500)

    const body = res.json()
    expect(body).toMatchObject({ error: 'Internal Server Error', statusCode: 500 })
    expect(body.message).toBe('An unexpected error occurred.')
    // The internal detail must NOT reach the client.
    expect(JSON.stringify(body)).not.toContain('hunter2')
    expect(JSON.stringify(body)).not.toContain('db-internal')
    // …but it IS available server-side, correlatable by request id.
    expect(body.requestId).toBe(res.headers['x-request-id'])
    const entry = log.find((e) => e.path === '/sync' && e.status === 500)
    expect(entry?.requestId).toBe(body.requestId)
    expect(entry?.error).toContain('hunter2')
  })

  it('returns a consistent, request-id-stamped 404 for an unknown route', async () => {
    const { app } = await harness()
    const res = await app.inject({ method: 'GET', url: '/no/such/route' })
    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body).toMatchObject({ error: 'Not Found', statusCode: 404 })
    expect(body.message).toContain('/no/such/route')
    expect(body.requestId).toBe(res.headers['x-request-id'])
  })

  it('keeps the helpful message on a 4xx validation error and stamps the request id', async () => {
    const { app, log } = await harness()
    // `ops` must be an array — a string trips schema validation (400).
    const res = await app.inject({ method: 'POST', url: '/sync', payload: { ops: 'not-an-array' } })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.statusCode).toBe(400)
    expect(body.message).toBeTruthy() // validation detail is client-facing and safe
    expect(body.requestId).toBe(res.headers['x-request-id'])
    // A 4xx is not a server error, so no internal detail is logged.
    const entry = log.find((e) => e.path === '/sync' && e.status === 400)
    expect(entry?.error).toBeUndefined()
  })

  it('leaves successful responses unchanged (no error fields, no server-side detail)', async () => {
    const { app, log } = await harness()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const entry = log.find((e) => e.path === '/health')
    expect(entry?.error).toBeUndefined()
  })
})
