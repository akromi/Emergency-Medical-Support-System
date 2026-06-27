import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'
import { AdminAuditStore, migrateAdminAudit } from '../src/admin-audit-store.js'

const ADMIN = 'admin-secret'

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateTenants(pool)
  await migrateAdminAudit(pool)
  const app = buildApp({
    store: new OpStore(pool),
    tenantStore: new TenantStore(pool),
    adminAuditStore: new AdminAuditStore(pool),
    security: { adminToken: ADMIN },
  })
  const admin = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${ADMIN}` }, payload })
  return { app, admin }
}

describe('admin-action audit trail', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('logs each tenant/key mutation, newest first, without leaking the token', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    const issued = (await h.admin('POST', '/admin/tenants/org-a/keys', { label: 'laptop' })).json()
    await h.admin('DELETE', `/admin/tenants/org-a/keys/${issued.key.id}`)
    await h.admin('PATCH', '/admin/tenants/org-a', { status: 'disabled' })

    const res = await h.admin('GET', '/admin/audit')
    const entries = res.json().entries
    expect(entries.map((e: { action: string }) => e.action))
      .toEqual(['tenant.status', 'key.revoke', 'key.issue', 'tenant.create'])
    expect(entries.every((e: { tenantId: string }) => e.tenantId === 'org-a')).toBe(true)

    const issue = entries.find((e: { action: string }) => e.action === 'key.issue')
    expect(issue.detail).toMatchObject({ keyId: issued.key.id, label: 'laptop' })

    // The plaintext token must never appear anywhere in the audit trail.
    expect(JSON.stringify(entries)).not.toContain(issued.token)
  })

  it('reads (GET) are not audited', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    await h.admin('GET', '/admin/tenants')
    await h.admin('GET', '/admin/tenants/org-a/keys')
    const entries = (await h.admin('GET', '/admin/audit')).json().entries
    expect(entries).toHaveLength(1) // only the create
    expect(entries[0].action).toBe('tenant.create')
  })

  it('filters the audit by ?tenant=', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    await h.admin('POST', '/admin/tenants', { id: 'org-b', name: 'B' })
    const onlyB = (await h.admin('GET', '/admin/audit?tenant=org-b')).json().entries
    expect(onlyB).toHaveLength(1)
    expect(onlyB[0].tenantId).toBe('org-b')
  })

  it('requires the admin token to read /admin/audit', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/admin/audit' })).statusCode).toBe(401)
  })
})
