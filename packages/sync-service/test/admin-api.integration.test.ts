import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { createEmptyRecord, diffToOps, type Op, type OpContext, type CasualtyRecord } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'

// Runtime tenant administration: provision tenants, issue/rotate/revoke API
// keys, and have those DB-backed keys authenticate + isolate /sync exactly like
// static tenants.

const ADMIN = 'admin-secret'
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
  const app = buildApp({ store: new OpStore(pool), tenantStore: new TenantStore(pool), security: { adminToken: ADMIN } })
  const admin = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${ADMIN}` }, payload })
  const sync = (token: string, ops: Op[], clientId: string) =>
    app.inject({ method: 'POST', url: '/sync', headers: { authorization: `Bearer ${token}` }, payload: { clientId, ops } })
  return { app, admin, sync }
}

describe('tenant-admin API', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('gates /admin/* behind the admin token', async () => {
    const noAuth = await h.app.inject({ method: 'POST', url: '/admin/tenants', payload: { id: 'org-a', name: 'A' } })
    expect(noAuth.statusCode).toBe(401)
    const wrong = await h.app.inject({
      method: 'POST', url: '/admin/tenants', headers: { authorization: 'Bearer nope' }, payload: { id: 'org-a', name: 'A' },
    })
    expect(wrong.statusCode).toBe(401)
    const ok = await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().tenant).toMatchObject({ id: 'org-a', name: 'A', status: 'active' })
  })

  it('rejects a duplicate tenant id', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    const dup = await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'Again' })
    expect(dup.statusCode).toBe(409)
  })

  it('issues a key that authenticates and isolates /sync', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    await h.admin('POST', '/admin/tenants', { id: 'org-b', name: 'B' })
    const keyA = (await h.admin('POST', '/admin/tenants/org-a/keys', { label: 'laptop' })).json()
    const keyB = (await h.admin('POST', '/admin/tenants/org-b/keys')).json()

    // The plaintext token is returned once; only a 4-char hint is retained.
    expect(keyA.token).toMatch(/^tlk_/)
    expect(keyA.key.hint).toBe(keyA.token.slice(-4))
    expect(keyA.key).not.toHaveProperty('token')

    // org-a's key creates CAS-1; an unknown token is rejected.
    expect((await h.sync(keyA.token, nameOps('CAS-1', 'a', 'Alice'), 'a')).statusCode).toBe(200)
    expect((await h.sync('tlk_bogus', [], 'x')).statusCode).toBe(401)

    // org-b sees none of org-a's records.
    const bView = (await h.sync(keyB.token, [], 'b')).json()
    expect(Object.keys(bView.records)).toHaveLength(0)

    // org-a sees its own.
    const aView = (await h.sync(keyA.token, [], 'a')).json()
    expect((aView.records['CAS-1'] as CasualtyRecord).tombstone.name).toBe('Alice')
  })

  it('rotates a key: revoke the old one, the new one keeps working', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    const k1 = (await h.admin('POST', '/admin/tenants/org-a/keys')).json()
    const k2 = (await h.admin('POST', '/admin/tenants/org-a/keys')).json()

    expect((await h.sync(k1.token, [], 'a')).statusCode).toBe(200)

    const revoke = await h.admin('DELETE', `/admin/tenants/org-a/keys/${k1.key.id}`)
    expect(revoke.statusCode).toBe(200)
    expect(revoke.json()).toEqual({ revoked: true })

    expect((await h.sync(k1.token, [], 'a')).statusCode).toBe(401) // revoked
    expect((await h.sync(k2.token, [], 'a')).statusCode).toBe(200) // still valid

    // Re-revoking is a 404 (idempotent: only an active key revokes).
    expect((await h.admin('DELETE', `/admin/tenants/org-a/keys/${k1.key.id}`)).statusCode).toBe(404)

    // The listing shows both keys with hints, the revoked one stamped.
    const keys = (await h.admin('GET', '/admin/tenants/org-a/keys')).json().keys
    expect(keys).toHaveLength(2)
    expect(keys[0].revokedAt).not.toBeNull()
    expect(keys[1].revokedAt).toBeNull()
  })

  it('disabling a tenant stops its keys', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    const key = (await h.admin('POST', '/admin/tenants/org-a/keys')).json()
    expect((await h.sync(key.token, [], 'a')).statusCode).toBe(200)

    const patch = await h.admin('PATCH', '/admin/tenants/org-a', { status: 'disabled' })
    expect(patch.json().tenant.status).toBe('disabled')
    expect((await h.sync(key.token, [], 'a')).statusCode).toBe(401)

    // Re-enable → the key works again.
    await h.admin('PATCH', '/admin/tenants/org-a', { status: 'active' })
    expect((await h.sync(key.token, [], 'a')).statusCode).toBe(200)
  })

  it('issuing a key for an unknown tenant is a 404', async () => {
    expect((await h.admin('POST', '/admin/tenants/ghost/keys')).statusCode).toBe(404)
  })

  it('lists tenants', async () => {
    await h.admin('POST', '/admin/tenants', { id: 'org-a', name: 'A' })
    await h.admin('POST', '/admin/tenants', { id: 'org-b', name: 'B' })
    const tenants = (await h.admin('GET', '/admin/tenants')).json().tenants
    expect(tenants.map((t: { id: string }) => t.id)).toEqual(['org-a', 'org-b'])
  })
})
