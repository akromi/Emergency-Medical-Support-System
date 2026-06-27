import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { createEmptyRecord, diffToOps, type Op, type OpContext, type CasualtyRecord } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// Incremental sync: a client checkpoints the `cursor` from its last response and
// sends it back as `since` to pull only the ops/records changed after it.

let seq = 0
function ctx(recordId: string, clientId: string, startLamport = 1): OpContext {
  let lamport = startLamport
  return { recordId, clientId, nextLamport: () => lamport++, now: () => 1_700_000_000_000, newId: () => `${clientId}-op-${++seq}` }
}
function nameOps(recordId: string, clientId: string, name: string, startLamport = 1): Op[] {
  const base = createEmptyRecord(recordId)
  return diffToOps(base, { ...base, tombstone: { ...base.tombstone, name } }, ctx(recordId, clientId, startLamport))
}

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const app = buildApp({ store: new OpStore(pool) })
  const sync = (body: { clientId: string; ops: Op[]; since?: number }) =>
    app.inject({ method: 'POST', url: '/sync', payload: body })
  return { app, sync }
}

describe('incremental since-cursor sync', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('returns a cursor; an up-to-date incremental sync returns an empty delta', async () => {
    const a = nameOps('CAS-1', 'a', 'Alice')
    const first = (await h.sync({ clientId: 'a', ops: a })).json()
    expect(first.cursor).toBeGreaterThan(0)
    expect(first.ops).toHaveLength(a.length)

    const second = (await h.sync({ clientId: 'a', ops: [], since: first.cursor })).json()
    expect(second.ops).toEqual([])
    expect(Object.keys(second.records)).toHaveLength(0)
    expect(second.cursor).toBe(first.cursor)
  })

  it('delivers only the ops and records changed since the cursor', async () => {
    await h.sync({ clientId: 'a', ops: nameOps('CAS-1', 'a', 'Alice') })
    const base = (await h.sync({ clientId: 'b', ops: nameOps('CAS-2', 'b', 'Bob') })).json()
    const cursor = base.cursor

    // A later edit to CAS-1 (higher Lamport → it wins deterministically).
    const more = nameOps('CAS-1', 'a', 'Alice Cooper', 5)
    await h.sync({ clientId: 'a', ops: more })

    const delta = (await h.sync({ clientId: 'c', ops: [], since: cursor })).json()
    expect((delta.ops as Op[]).map((o) => o.id).sort()).toEqual(more.map((o) => o.id).sort())
    expect(Object.keys(delta.records)).toEqual(['CAS-1']) // CAS-2 unchanged → omitted
    expect((delta.records['CAS-1'] as CasualtyRecord).tombstone.name).toBe('Alice Cooper')
    expect(delta.cursor).toBeGreaterThan(cursor)
  })

  it('since=0 is equivalent to a full pull', async () => {
    await h.sync({ clientId: 'a', ops: nameOps('CAS-1', 'a', 'Alice') })
    await h.sync({ clientId: 'b', ops: nameOps('CAS-2', 'b', 'Bob') })
    const all = (await h.sync({ clientId: 'c', ops: [], since: 0 })).json()
    expect(Object.keys(all.records).sort()).toEqual(['CAS-1', 'CAS-2'])
    expect((all.ops as Op[]).length).toBe(2)
  })

  it('omitting `since` still returns full state (backward compatible)', async () => {
    await h.sync({ clientId: 'a', ops: nameOps('CAS-1', 'a', 'Alice') })
    const full = (await h.sync({ clientId: 'b', ops: [] })).json()
    expect(Object.keys(full.records)).toEqual(['CAS-1'])
    expect(full.cursor).toBeGreaterThan(0)
  })
})
