import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import {
  createEmptyRecord, diffToOps, resolve, mergeOps,
  type CasualtyRecord, type Op, type OpContext,
} from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

const RECORD_ID = 'CAS-1'

// Deterministic per-client op context. Op ids are globally unique (across
// contexts) so independently-built op streams never collide by id.
let globalOpSeq = 0
function ctx(clientId: string, startLamport = 1): OpContext {
  let lamport = startLamport
  return {
    recordId: RECORD_ID,
    clientId,
    nextLamport: () => lamport++,
    now: () => 1_700_000_000_000,
    newId: () => `${clientId}-op-${++globalOpSeq}`,
  }
}

const injury = (id: string, over: Partial<CasualtyRecord['injuries'][number]> = {}) => ({
  id, view: 'anterior' as const, x: 1, y: 2, region: 'Chest',
  type: 'gsw' as const, severity: 'critical' as const, notes: '', ...over,
})

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  const store = new OpStore(pool)
  const app = buildApp({ store })
  const post = (ops: Op[], clientId: string) =>
    app.inject({ method: 'POST', url: '/sync', payload: { clientId, ops } })
  const get = (recordId = RECORD_ID) => app.inject({ method: 'GET', url: `/sync/${recordId}` })
  return { app, store, post, get }
}

describe('sync-service integration', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('two offline clients editing one record converge with no lost writes', async () => {
    const base = createEmptyRecord(RECORD_ID)

    // Client A (offline): set patient name + add an injury.
    const aNext: CasualtyRecord = {
      ...base,
      tombstone: { ...base.tombstone, name: 'Alice' },
      injuries: [injury('inj-A', { notes: 'from A' })],
    }
    const opsA = diffToOps(base, aNext, ctx('A'))

    // Client B (offline): set triage + add a different injury.
    const bNext: CasualtyRecord = {
      ...base,
      incident: { ...base.incident, triage: 'immediate' },
      injuries: [injury('inj-B', { view: 'posterior', region: 'L Thigh', type: 'laceration', notes: 'from B' })],
    }
    const opsB = diffToOps(base, bNext, ctx('B'))

    // They come online and sync (A first, then B).
    const r1 = await h.post(opsA, 'A')
    expect(r1.statusCode).toBe(200)
    const r2 = await h.post(opsB, 'B')
    expect(r2.statusCode).toBe(200)

    const server = r2.json().records[RECORD_ID] as CasualtyRecord
    // Both clients' edits survive — nothing clobbered.
    expect(server.tombstone.name).toBe('Alice')
    expect(server.incident.triage).toBe('immediate')
    expect(server.injuries.map((i) => i.id).sort()).toEqual(['inj-A', 'inj-B'])

    // Each client pulls the full op set and resolves locally → identical state.
    const allOps = r2.json().ops as Op[]
    const aView = resolve(RECORD_ID, mergeOps(opsA, allOps)).record
    const bView = resolve(RECORD_ID, mergeOps(opsB, allOps)).record
    expect(aView).toEqual(server)
    expect(bView).toEqual(server)
    expect(aView).toEqual(bView) // convergence
  })

  it('converges regardless of which client syncs first', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' }, injuries: [injury('inj-A')] }, ctx('A'))
    const opsB = diffToOps(base, { ...base, incident: { ...base.incident, triage: 'delayed' }, injuries: [injury('inj-B')] }, ctx('B'))

    // A-first on one server instance, B-first on a fresh one.
    const hAB = await harness()
    await hAB.post(opsA, 'A')
    const resAB = (await hAB.post(opsB, 'B')).json().records[RECORD_ID]

    const hBA = await harness()
    await hBA.post(opsB, 'B')
    const resBA = (await hBA.post(opsA, 'A')).json().records[RECORD_ID]

    expect(resAB).toEqual(resBA)
  })

  it('ingest is idempotent — re-sending the same ops adds nothing', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A'))

    const first = await h.post(opsA, 'A')
    expect(first.json().ingested).toBe(opsA.length)
    const second = await h.post(opsA, 'A') // exact replay
    expect(second.json().ingested).toBe(0)

    const view = (await h.get()).json()
    expect((view.ops as Op[]).length).toBe(opsA.length)
    // Audit recorded each op once, not twice.
    const ingestedEvents = (view.audit as Array<{ eventType: string }>).filter((a) => a.eventType === 'op-ingested')
    expect(ingestedEvents).toHaveLength(opsA.length)
  })

  it('same-field conflict resolves deterministically, is audited, and loses no op', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A', 1))
    const opsB = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Bob' } }, ctx('B', 5))

    await h.post(opsA, 'A')
    const r = await h.post(opsB, 'B')
    const server = r.json().records[RECORD_ID] as CasualtyRecord
    expect(server.tombstone.name).toBe('Bob') // higher Lamport wins (deterministic, not wall-clock LWW)

    const view = (await h.get()).json()
    // Both competing ops remain in the append-only log.
    expect((view.ops as Op[]).length).toBe(2)
    const conflicts = (view.audit as Array<{ eventType: string; detail: any }>).filter((a) => a.eventType === 'conflict-resolved')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].detail.target).toBe('tombstone.name')
    expect(conflicts[0].detail.supersededOpIds).toContain(opsA[0].id)
  })

  it('does not re-log an existing conflict when a later unrelated op arrives', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A', 1))
    const opsB = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Bob' } }, ctx('B', 5))
    await h.post(opsA, 'A')
    await h.post(opsB, 'B') // conflict on tombstone.name -> logged once

    // A later edits a DIFFERENT field; this must not re-log the old conflict.
    const opsC = diffToOps(base, { ...base, incident: { ...base.incident, triage: 'delayed' } }, ctx('A', 9))
    const r = await h.post(opsC, 'A')
    expect(r.json().ingested).toBe(opsC.length)

    const audit = (await h.get()).json().audit as Array<{ eventType: string }>
    expect(audit.filter((a) => a.eventType === 'conflict-resolved')).toHaveLength(1)
  })

  it('returns a resolved snapshot even when none was stored (replay sync)', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A'))
    // Insert ops directly via the store so NO snapshot is ever persisted.
    await h.store.insertOps(opsA)

    // A replay sync introduces no new ops, so the endpoint won't re-resolve from
    // the ingest path — it must still return a non-null, resolved snapshot.
    const r = await h.post(opsA, 'A')
    expect(r.json().ingested).toBe(0)
    const rec = r.json().records[RECORD_ID] as CasualtyRecord | null
    expect(rec).not.toBeNull()
    expect(rec!.tombstone.name).toBe('Alice')
  })

  it('GET resolves a snapshot on demand when none was stored', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A'))
    await h.store.insertOps(opsA) // ops present, snapshot never written

    const view = (await h.get()).json()
    expect(view.snapshot).not.toBeNull()
    expect((view.snapshot as CasualtyRecord).tombstone.name).toBe('Alice')
    expect((view.ops as Op[]).length).toBe(opsA.length)
  })

  it('delivers remote-only records to a device that never journaled them', async () => {
    const base = createEmptyRecord(RECORD_ID)
    const opsA = diffToOps(base, { ...base, tombstone: { ...base.tombstone, name: 'Alice' } }, ctx('A'))
    await h.post(opsA, 'A') // device A creates the case

    // Device B has never seen this case and uploads nothing of its own.
    const r = await h.post([], 'B')
    const rec = r.json().records[RECORD_ID] as CasualtyRecord | null
    expect(rec).not.toBeNull()
    expect(rec!.tombstone.name).toBe('Alice')
    expect((r.json().ops as Op[]).some((o) => o.recordId === RECORD_ID)).toBe(true)
  })

  it('serves health', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' })
    expect(res.json()).toEqual({ ok: true })
  })
})
