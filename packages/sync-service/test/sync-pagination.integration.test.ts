import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import type { Op } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

// The full-state (no-cursor) /sync pull is paginated by record id, so a large
// caseload never yields an unbounded response. A client pages with `after` until
// `nextPage` is null, then checkpoints `cursor` and syncs incrementally.

// One scalar op that creates record `recordId`.
function scalarOp(recordId: string, seq: number): Op {
  return {
    id: `op-${recordId}-${seq}`, recordId, clientId: 'c1',
    lamport: seq, ts: 1_700_000_000_000, kind: 'scalar',
    path: 'tombstone.name', value: `Name ${recordId}`,
  }
}

async function harness(syncPageLimit?: number) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const app = buildApp({ store: new OpStore(pool), security: { syncPageLimit } })
  const sync = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/sync', payload }).then((r) => ({ status: r.statusCode, body: r.json() }))
  return { app, sync }
}

// Record ids are zero-padded so lexical order (the cursor order) is predictable.
const ids = (n: number) => Array.from({ length: n }, (_, i) => `CAS-${String(i + 1).padStart(2, '0')}`)

describe('full-state sync pagination', () => {
  it('walks every record across pages with no duplicates, then signals completion', async () => {
    const { sync } = await harness(2) // 2 records per page
    // Seed 5 distinct records.
    await sync({ clientId: 'seed', ops: ids(5).map((r, i) => scalarOp(r, i + 1)) })

    const seen: string[] = []
    let after = ''
    let pages = 0
    for (;;) {
      const { body } = await sync({ ops: [], after })
      pages += 1
      const page = Object.keys(body.records)
      expect(page.length).toBeLessThanOrEqual(2) // never exceeds the page size
      seen.push(...page)
      if (body.nextPage == null) break
      // The cursor is the last record id of the page.
      expect(body.nextPage).toBe(page[page.length - 1])
      after = body.nextPage
      expect(pages).toBeLessThan(10) // guard against a cursor that never advances
    }

    expect(pages).toBe(3) // 2 + 2 + 1
    expect(seen.sort()).toEqual(ids(5)) // every record, exactly once
    expect(new Set(seen).size).toBe(seen.length) // no duplicates
  })

  it('returns everything in one page (nextPage null) when the caseload fits', async () => {
    const { sync } = await harness(500)
    await sync({ clientId: 'seed', ops: ids(3).map((r, i) => scalarOp(r, i + 1)) })
    const { body } = await sync({ ops: [] })
    expect(Object.keys(body.records).sort()).toEqual(ids(3))
    expect(body.nextPage).toBeNull()
  })

  it('clamps a client-requested page to SYNC_PAGE_MAX (1000) via schema, rejecting larger', async () => {
    const { sync } = await harness()
    await sync({ clientId: 'seed', ops: ids(1).map((r, i) => scalarOp(r, i + 1)) })
    // limit above the hard max is a schema violation (400), not silently honoured.
    const res = await sync({ ops: [], limit: 5000 })
    expect(res.status).toBe(400)
    // A limit within range is accepted.
    const ok = await sync({ ops: [], limit: 1 })
    expect(ok.status).toBe(200)
  })

  it('still exposes the incremental cursor so the client can switch to `since`', async () => {
    const { sync } = await harness(2)
    await sync({ clientId: 'seed', ops: ids(3).map((r, i) => scalarOp(r, i + 1)) })
    const { body } = await sync({ ops: [] })
    expect(typeof body.cursor).toBe('number')
    expect(body.cursor).toBeGreaterThan(0)
  })
})
