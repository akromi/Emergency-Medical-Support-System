import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// Readiness (/ready) reflects DB connectivity, distinct from liveness (/health,
// which is up whenever the process is). Both are unauthenticated.

async function healthyApp() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  return buildApp({ store: new OpStore(pool) })
}

function downApp() {
  const pool: Queryable = { query: async () => { throw new Error('db unreachable') } }
  return buildApp({ store: new OpStore(pool) })
}

describe('readiness probe', () => {
  it('returns 200 ready:true when the database answers', async () => {
    const res = await (await healthyApp()).inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ready: true })
  })

  it('returns 503 ready:false when the database is unreachable', async () => {
    const res = await downApp().inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ ready: false })
  })

  it('keeps liveness (/health) up regardless of DB state', async () => {
    expect((await downApp().inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
  })

  it('is unauthenticated even when admin/tenant auth is configured', async () => {
    const db = newDb()
    const pg = db.adapters.createPg()
    const pool = new pg.Pool() as unknown as Queryable
    await migrate(pool)
    const app = buildApp({ store: new OpStore(pool), security: { adminToken: 'secret', authToken: 't' } })
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200)
  })
})
