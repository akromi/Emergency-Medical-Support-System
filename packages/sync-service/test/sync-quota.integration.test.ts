import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import type { Op } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { Metrics } from '../src/metrics.js'

// Per-tenant storage quota: a noisy-neighbor guard. A tenant at/over its cap has
// further WRITES refused (403) — but PULLS are always allowed, so a full tenant
// can still sync down. Default-off: unset quota leaves behaviour unchanged.

function scalarOp(recordId: string, seq: number): Op {
  return {
    id: `op-${recordId}-${seq}`, recordId, clientId: 'c1',
    lamport: seq, ts: 1_700_000_000_000, kind: 'scalar',
    path: 'tombstone.name', value: `Name ${recordId}`,
  }
}

async function harness(tenantQuota?: { maxOps?: number; maxRecords?: number }) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const metrics = new Metrics()
  const app = buildApp({ store: new OpStore(pool), metrics, security: { tenantQuota } })
  const sync = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/sync', payload }).then((r) => ({ status: r.statusCode, body: r.json() }))
  return { app, metrics, sync }
}

describe('per-tenant storage quota', () => {
  it('refuses writes once the op cap is reached, with an actionable 403', async () => {
    const { sync, metrics } = await harness({ maxOps: 2 })
    expect((await sync({ ops: [scalarOp('CAS-1', 1), scalarOp('CAS-2', 2)] })).status).toBe(200)

    const rejected = await sync({ ops: [scalarOp('CAS-3', 3)] })
    expect(rejected.status).toBe(403)
    expect(rejected.body).toMatchObject({ error: 'Forbidden', statusCode: 403 })
    expect(rejected.body.message).toMatch(/quota exceeded/i)
    expect(rejected.body.quota).toEqual({ maxOps: 2, maxRecords: null })
    expect(rejected.body.usage).toEqual({ ops: 2, records: 2 })
    expect(rejected.body.requestId).toBeTruthy()
    // The rejected op was not stored.
    expect(metrics.snapshot().tenants.default.quotaRejections).toBe(1)
  })

  it('still allows PULLS (empty ops) when the tenant is over quota', async () => {
    const { sync } = await harness({ maxOps: 1 })
    expect((await sync({ ops: [scalarOp('CAS-1', 1)] })).status).toBe(200)
    // Now at the cap — a write is refused…
    expect((await sync({ ops: [scalarOp('CAS-2', 2)] })).status).toBe(403)
    // …but a pure pull is allowed, and returns the stored record.
    const pull = await sync({ ops: [] })
    expect(pull.status).toBe(200)
    expect(Object.keys(pull.body.records)).toContain('CAS-1')
  })

  it('enforces the record cap independently of the op cap', async () => {
    const { sync } = await harness({ maxRecords: 2 })
    // Two records (multiple ops each) — still within the 2-record cap.
    expect((await sync({ ops: [scalarOp('CAS-1', 1), scalarOp('CAS-1', 2), scalarOp('CAS-2', 3)] })).status).toBe(200)
    // A third record is refused.
    const rejected = await sync({ ops: [scalarOp('CAS-3', 4)] })
    expect(rejected.status).toBe(403)
    expect(rejected.body.usage.records).toBe(2)
  })

  it('is default-off: no quota → writes are never refused', async () => {
    const { sync } = await harness() // no quota configured
    for (let i = 1; i <= 20; i++) {
      expect((await sync({ ops: [scalarOp(`CAS-${i}`, i)] })).status).toBe(200)
    }
  })
})
