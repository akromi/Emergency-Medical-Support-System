import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'
import { pruneTenantAudit } from '../src/retention.js'

// Per-tenant audit-log retention (TTL). The audit log is observational, so
// pruning it by age is safe and never touches the op-log (source of truth).

const ADMIN = 'admin-secret'
const DAY = 24 * 60 * 60 * 1000

// Insert an audit row with an explicit created_at (so age is controllable).
async function seedAudit(pool: Queryable, tenant: string, recordId: string, ageMs: number, now: number) {
  await pool.query(
    `INSERT INTO audit (tenant_id, record_id, op_id, event_type, detail, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenant, recordId, 'op-x', 'op-ingested', '{}', new Date(now - ageMs)],
  )
}

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateTenants(pool)
  const store = new OpStore(pool)
  const app = buildApp({ store, tenantStore: new TenantStore(pool), security: { adminToken: ADMIN, auditRetentionMs: 30 * DAY } })
  const admin = (url: string, payload?: object) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${ADMIN}` }, payload })
  return { app, pool, store, admin }
}

describe('audit-log retention', () => {
  it('pruneTenantAudit deletes only entries older than the window', async () => {
    const { pool, store } = await harness()
    const now = 1_900_000_000_000
    await seedAudit(pool, 'default', 'CAS-old', 40 * DAY, now) // older than 30d → pruned
    await seedAudit(pool, 'default', 'CAS-recent', 5 * DAY, now) // within 30d → kept

    const pruned = await pruneTenantAudit(store, 'default', { auditMaxAgeMs: 30 * DAY }, now)
    expect(pruned).toBe(1)
    expect((await store.getAudit('CAS-old')).length).toBe(0)
    expect((await store.getAudit('CAS-recent')).length).toBe(1)
  })

  it('is default-off: a zero/undefined window prunes nothing', async () => {
    const { pool, store } = await harness()
    const now = 1_900_000_000_000
    await seedAudit(pool, 'default', 'CAS-old', 999 * DAY, now)
    expect(await pruneTenantAudit(store, 'default', {}, now)).toBe(0)
    expect(await pruneTenantAudit(store, 'default', { auditMaxAgeMs: 0 }, now)).toBe(0)
    expect((await store.getAudit('CAS-old')).length).toBe(1) // untouched
  })

  it('POST /admin/retention prunes across tenants and is admin-gated', async () => {
    const { app, pool, admin } = await harness()
    await admin('/admin/tenants', { id: 'org-a', name: 'A' })
    const now = Date.now()
    await seedAudit(pool, 'default', 'CAS-1', 60 * DAY, now)
    await seedAudit(pool, 'org-a', 'CAS-2', 60 * DAY, now)
    await seedAudit(pool, 'org-a', 'CAS-3', 1 * DAY, now) // recent, kept

    // Unauthenticated → 401 (the /admin gate).
    const noAuth = await app.inject({ method: 'POST', url: '/admin/retention', payload: {} })
    expect(noAuth.statusCode).toBe(401)

    const res = await admin('/admin/retention', {})
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(2) // one old in default + one old in org-a
    expect(body.prunedByTenant.default).toBe(1)
    expect(body.prunedByTenant['org-a']).toBe(1)
  })

  it('POST /admin/retention 400s when no window is configured or supplied', async () => {
    const db = newDb()
    const pg = db.adapters.createPg()
    const pool = new pg.Pool() as unknown as Queryable
    await migrate(pool)
    await migrateTenants(pool)
    // No auditRetentionMs configured.
    const app = buildApp({ store: new OpStore(pool), tenantStore: new TenantStore(pool), security: { adminToken: ADMIN } })
    const res = await app.inject({ method: 'POST', url: '/admin/retention', headers: { authorization: `Bearer ${ADMIN}` }, payload: {} })
    expect(res.statusCode).toBe(400)
    // An explicit override still works.
    const ok = await app.inject({ method: 'POST', url: '/admin/retention', headers: { authorization: `Bearer ${ADMIN}` }, payload: { auditMaxAgeMs: DAY } })
    expect(ok.statusCode).toBe(200)
  })
})
