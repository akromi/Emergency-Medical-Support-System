import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { createEmptyRecord, diffToOps, type CasualtyRecord, type Op, type OpContext } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// Multi-tenant isolation: per-tenant API keys authenticate AND scope data, so
// one tenant can never read or resolve another's records — even at the same id.

let seq = 0
function ctx(recordId: string, clientId: string): OpContext {
  let lamport = 1
  return {
    recordId, clientId,
    nextLamport: () => lamport++, now: () => 1_700_000_000_000, newId: () => `${clientId}-op-${++seq}`,
  }
}

const TOKENS = { a: 'tenant-a-key', b: 'tenant-b-key' }

function nameOps(recordId: string, clientId: string, name: string): Op[] {
  const base = createEmptyRecord(recordId)
  return diffToOps(base, { ...base, tombstone: { ...base.tombstone, name } }, ctx(recordId, clientId))
}

async function poolFor(): Promise<Queryable> {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  return pool
}

async function harness() {
  const app = buildApp({
    store: new OpStore(await poolFor()),
    security: { tenants: [{ id: 'org-a', token: TOKENS.a }, { id: 'org-b', token: TOKENS.b }] },
  })
  const post = (token: string, ops: Op[], clientId: string) =>
    app.inject({ method: 'POST', url: '/sync', headers: { authorization: `Bearer ${token}` }, payload: { clientId, ops } })
  return { app, post }
}

describe('sync-service multi-tenant isolation', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('rejects requests with no or invalid token', async () => {
    const none = await h.app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c', ops: [] } })
    expect(none.statusCode).toBe(401)
    const bad = await h.app.inject({
      method: 'POST', url: '/sync', headers: { authorization: 'Bearer nope' }, payload: { clientId: 'c', ops: [] },
    })
    expect(bad.statusCode).toBe(401)
  })

  it('keeps each tenant’s records invisible to the other', async () => {
    await h.post(TOKENS.a, nameOps('CAS-1', 'a1', 'Alice'), 'a1')
    await h.post(TOKENS.b, nameOps('CAS-2', 'b1', 'Bob'), 'b1')

    const aView = (await h.post(TOKENS.a, [], 'a1')).json()
    expect(Object.keys(aView.records)).toEqual(['CAS-1'])
    expect((aView.records['CAS-1'] as CasualtyRecord).tombstone.name).toBe('Alice')

    const bView = (await h.post(TOKENS.b, [], 'b1')).json()
    expect(Object.keys(bView.records)).toEqual(['CAS-2'])
    expect((bView.records['CAS-2'] as CasualtyRecord).tombstone.name).toBe('Bob')
  })

  it('isolates the SAME record id across tenants', async () => {
    await h.post(TOKENS.a, nameOps('CAS-9', 'a1', 'A-name'), 'a1')
    await h.post(TOKENS.b, nameOps('CAS-9', 'b1', 'B-name'), 'b1')

    const aView = (await h.post(TOKENS.a, [], 'a1')).json()
    const bView = (await h.post(TOKENS.b, [], 'b1')).json()
    expect((aView.records['CAS-9'] as CasualtyRecord).tombstone.name).toBe('A-name')
    expect((bView.records['CAS-9'] as CasualtyRecord).tombstone.name).toBe('B-name')
    expect((aView.ops as Op[]).length).toBe(1) // only the tenant's own op
    expect((bView.ops as Op[]).length).toBe(1)
  })

  it('GET /sync/:id is tenant-scoped', async () => {
    await h.post(TOKENS.a, nameOps('CAS-1', 'a1', 'Alice'), 'a1')
    const bGet = await h.app.inject({
      method: 'GET', url: '/sync/CAS-1', headers: { authorization: `Bearer ${TOKENS.b}` },
    })
    const body = bGet.json()
    expect(body.snapshot).toBeNull() // not tenant B's record
    expect((body.ops as Op[]).length).toBe(0)
  })

  it('authenticates the legacy single authToken as the default tenant', async () => {
    const app = buildApp({ store: new OpStore(await poolFor()), security: { authToken: 'legacy' } })
    const ok = await app.inject({
      method: 'POST', url: '/sync', headers: { authorization: 'Bearer legacy' },
      payload: { clientId: 'c', ops: nameOps('CAS-1', 'c', 'Zed') },
    })
    expect(ok.statusCode).toBe(200)
    expect((ok.json().records['CAS-1'] as CasualtyRecord).tombstone.name).toBe('Zed')
  })
})
