import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import type { AccessLogEntry } from '../src/metrics.js'

// Every response carries an x-request-id (inbound one honoured, else minted),
// and that id appears in the structured access log — so a request can be traced
// across the PWA → sync-service → EHR gateway.

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const log: AccessLogEntry[] = []
  const app = buildApp({ store: new OpStore(pool), onAccessLog: (e) => log.push(e) })
  return { app, log }
}

describe('request-id correlation', () => {
  it('mints an x-request-id when none is supplied', async () => {
    const { app } = await harness()
    const res = await app.inject({ method: 'GET', url: '/health' })
    const id = res.headers['x-request-id']
    expect(typeof id).toBe('string')
    expect((id as string).length).toBeGreaterThan(0)
  })

  it('honours an inbound x-request-id', async () => {
    const { app } = await harness()
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'trace-abc-123' } })
    expect(res.headers['x-request-id']).toBe('trace-abc-123')
  })

  it('records the same id in the access log', async () => {
    const { app, log } = await harness()
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'trace-xyz' } })
    expect(res.headers['x-request-id']).toBe('trace-xyz')
    const entry = log.find((e) => e.path === '/health')
    expect(entry?.requestId).toBe('trace-xyz')
  })

  it('still carries an id on an unauthenticated 401', async () => {
    const db = newDb()
    const pg = db.adapters.createPg()
    const pool = new pg.Pool() as unknown as Queryable
    await migrate(pool)
    const app = buildApp({ store: new OpStore(pool), security: { authToken: 'secret' } })
    const res = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c', ops: [] } })
    expect(res.statusCode).toBe(401)
    expect(typeof res.headers['x-request-id']).toBe('string')
  })
})
