import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { createEmptyRecord, diffToOps, type Op, type OpContext } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'
import { Metrics, type AccessLogEntry } from '../src/metrics.js'

const ADMIN = 'admin-secret'
const TOKENS = { a: 'key-a', b: 'key-b' }

let seq = 0
function ctx(recordId: string, clientId: string): OpContext {
  let l = 1
  return { recordId, clientId, nextLamport: () => l++, now: () => 1_700_000_000_000, newId: () => `${clientId}-op-${++seq}` }
}
function nameOps(recordId: string, clientId: string, name: string): Op[] {
  const base = createEmptyRecord(recordId)
  return diffToOps(base, { ...base, tombstone: { ...base.tombstone, name } }, ctx(recordId, clientId))
}

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateTenants(pool)
  const metrics = new Metrics()
  const log: AccessLogEntry[] = []
  const app = buildApp({
    store: new OpStore(pool),
    tenantStore: new TenantStore(pool),
    metrics,
    onAccessLog: (e) => log.push(e),
    security: { tenants: [{ id: 'org-a', token: TOKENS.a }, { id: 'org-b', token: TOKENS.b }], adminToken: ADMIN },
  })
  const sync = (token: string, ops: Op[]) =>
    app.inject({ method: 'POST', url: '/sync', headers: { authorization: `Bearer ${token}` }, payload: { clientId: 'c', ops } })
  const metricsApi = () => app.inject({ method: 'GET', url: '/admin/metrics', headers: { authorization: `Bearer ${ADMIN}` } })
  return { app, sync, metricsApi, log, metrics }
}

describe('per-tenant observability', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('counts sync requests and ingested ops per tenant', async () => {
    const aOps = nameOps('CAS-1', 'a', 'Alice')
    await h.sync(TOKENS.a, aOps)
    await h.sync(TOKENS.a, []) // pull-only, no new ops
    await h.sync(TOKENS.b, nameOps('CAS-2', 'b', 'Bob'))

    const snap = (await h.metricsApi()).json().tenants
    expect(snap['org-a'].syncRequests).toBe(2)
    expect(snap['org-a'].opsIngested).toBe(aOps.length)
    expect(snap['org-a'].responses['2xx']).toBeGreaterThanOrEqual(2)
    expect(snap['org-b'].syncRequests).toBe(1)
    expect(snap['org-b'].opsIngested).toBe(1)
  })

  it('does not double-count idempotent replays', async () => {
    const aOps = nameOps('CAS-1', 'a', 'Alice')
    await h.sync(TOKENS.a, aOps)
    await h.sync(TOKENS.a, aOps) // exact replay → 0 newly ingested
    const snap = (await h.metricsApi()).json().tenants
    expect(snap['org-a'].syncRequests).toBe(2)
    expect(snap['org-a'].opsIngested).toBe(aOps.length) // not doubled
  })

  it('buckets a rejected request under 4xx (no tenant leak)', async () => {
    await h.app.inject({ method: 'POST', url: '/sync', headers: { authorization: 'Bearer nope' }, payload: { clientId: 'c', ops: [] } })
    const snap = (await h.metricsApi()).json().tenants
    // The unauthenticated attempt is bucketed under the default tenant, not org-a/b.
    expect(snap['default']?.responses['4xx']).toBeGreaterThanOrEqual(1)
    expect(snap['org-a']).toBeUndefined()
  })

  it('emits a structured access-log line per response', async () => {
    await h.sync(TOKENS.a, [])
    const entry = h.log.find((e) => e.path === '/sync')
    expect(entry).toMatchObject({ method: 'POST', path: '/sync', tenant: 'org-a', status: 200 })
    expect(typeof entry!.ms).toBe('number')
  })

  it('requires the admin token to read /admin/metrics', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/admin/metrics' })).statusCode).toBe(401)
  })
})
