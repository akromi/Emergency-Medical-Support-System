import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// The /sync limiter is keyed per TENANT, resolved from the credential (not
// req.tenantId, which the limiter hook may run before). One tenant exhausting
// its budget must not throttle another — nor collapse into a shared bucket.

const TOKENS = { a: 'key-a', b: 'key-b' }

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const app = buildApp({
    store: new OpStore(pool),
    security: {
      tenants: [{ id: 'org-a', token: TOKENS.a }, { id: 'org-b', token: TOKENS.b }],
      syncRateLimitMax: 2,
    },
  })
  const sync = (token: string) =>
    app.inject({ method: 'POST', url: '/sync', headers: { authorization: `Bearer ${token}` }, payload: { clientId: 'c', ops: [] } })
  return { sync }
}

describe('per-tenant /sync rate limit', () => {
  it('throttles a tenant on its own bucket without affecting others', async () => {
    const h = await harness()
    expect((await h.sync(TOKENS.a)).statusCode).toBe(200)
    expect((await h.sync(TOKENS.a)).statusCode).toBe(200)
    expect((await h.sync(TOKENS.a)).statusCode).toBe(429) // org-a exhausted its budget

    // org-b has its own bucket — if the key collapsed to a shared 'default',
    // this would already be 429.
    expect((await h.sync(TOKENS.b)).statusCode).toBe(200)
  })
})
