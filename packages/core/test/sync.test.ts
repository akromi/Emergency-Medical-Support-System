import { describe, it, expect } from 'vitest'
import {
  createEmptyRecord, diffToOps, resolve, mergeOps, compareOps,
  type CasualtyRecord, type Op, type OpContext,
} from '../src/index'

// A deterministic op context for a given client (no wall-clock/random nondeterminism).
function ctx(clientId: string, startLamport = 1): OpContext {
  let lamport = startLamport
  let n = 0
  return {
    recordId: 'CAS-1',
    clientId,
    nextLamport: () => lamport++,
    now: () => 1_700_000_000_000 + n,
    newId: () => `${clientId}-op-${++n}`,
  }
}

const base = (): CasualtyRecord => createEmptyRecord('CAS-1')

const injury = (id: string, over: Partial<CasualtyRecord['injuries'][number]> = {}) => ({
  id, view: 'anterior' as const, x: 1, y: 2, region: 'Chest',
  type: 'gsw' as const, severity: 'critical' as const, notes: '', ...over,
})

describe('diffToOps', () => {
  it('emits one op per changed scalar field and per changed item', () => {
    const r0 = base()
    const r1: CasualtyRecord = {
      ...r0,
      tombstone: { ...r0.tombstone, name: 'Doe, Jane' },
      incident: { ...r0.incident, triage: 'immediate' },
      injuries: [injury('inj-1')],
    }
    const ops = diffToOps(r0, r1, ctx('A'))
    const scalar = ops.filter((o) => o.kind === 'scalar').map((o) => o.path).sort()
    expect(scalar).toEqual(['incident.triage', 'tombstone.name'])
    expect(ops.filter((o) => o.kind === 'item-put').map((o) => o.itemId)).toEqual(['inj-1'])
  })

  it('journals createdAt on first save so it survives a resolve round-trip', () => {
    const rec: CasualtyRecord = {
      ...base(),
      createdAt: 1_600_000_000_000, // original creation time
      tombstone: { ...base().tombstone, name: 'Doe, Jane' },
    }
    const ops = diffToOps(undefined, rec, ctx('A')) // first journaling (prev = undefined)
    expect(ops.some((o) => o.kind === 'scalar' && o.path === 'createdAt')).toBe(true)
    const resolved = resolve('CAS-1', ops).record
    expect(resolved.createdAt).toBe(1_600_000_000_000) // not the op ts
    expect(resolved.tombstone.name).toBe('Doe, Jane')
  })

  it('does not re-journal createdAt on steady-state saves', () => {
    const r0 = base()
    const r1: CasualtyRecord = { ...r0, tombstone: { ...r0.tombstone, name: 'X' } }
    const ops = diffToOps(r0, r1, ctx('A')) // prev defined, createdAt unchanged
    expect(ops.some((o) => o.path === 'createdAt')).toBe(false)
  })

  it('emits item-remove when an item disappears', () => {
    const r0: CasualtyRecord = { ...base(), injuries: [injury('inj-1')] }
    const r1: CasualtyRecord = { ...base(), injuries: [] }
    const ops = diffToOps(r0, r1, ctx('A'))
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'item-remove', path: 'injuries', itemId: 'inj-1' })
  })
})

describe('resolve — determinism & convergence', () => {
  it('is independent of op order', () => {
    const a = diffToOps(base(), { ...base(), tombstone: { ...base().tombstone, name: 'Alice' } }, ctx('A'))
    const b = diffToOps(base(), { ...base(), incident: { ...base().incident, triage: 'immediate' } }, ctx('B'))
    const forward = resolve('CAS-1', mergeOps(a, b)).record
    const reversed = resolve('CAS-1', mergeOps(a, b).reverse()).record
    expect(forward).toEqual(reversed)
  })

  it('merges concurrent edits to different targets with no lost writes', () => {
    const a = diffToOps(base(), {
      ...base(), tombstone: { ...base().tombstone, name: 'Alice' }, injuries: [injury('inj-A')],
    }, ctx('A'))
    const b = diffToOps(base(), {
      ...base(), incident: { ...base().incident, triage: 'immediate' }, injuries: [injury('inj-B', { notes: 'B' })],
    }, ctx('B'))

    const { record } = resolve('CAS-1', mergeOps(a, b))
    expect(record.tombstone.name).toBe('Alice')        // A survives
    expect(record.incident.triage).toBe('immediate')   // B survives
    expect(record.injuries.map((i) => i.id).sort()).toEqual(['inj-A', 'inj-B']) // both items
  })

  it('picks a deterministic winner for same-field edits and reports the conflict', () => {
    const a = diffToOps(base(), { ...base(), tombstone: { ...base().tombstone, name: 'Alice' } }, ctx('A', 1))
    const b = diffToOps(base(), { ...base(), tombstone: { ...base().tombstone, name: 'Bob' } }, ctx('B', 5))
    const { record, conflicts } = resolve('CAS-1', mergeOps(a, b))
    expect(record.tombstone.name).toBe('Bob') // higher Lamport wins (not wall-clock)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].target).toBe('tombstone.name')
    expect(conflicts[0].supersededOpIds).toEqual([a[0].id]) // losing op retained, not dropped
  })

  it('orders ops by Lamport, then clientId, then id', () => {
    const mk = (over: Partial<Op>): Op => ({
      id: 'x', recordId: 'CAS-1', clientId: 'A', lamport: 1, ts: 0, kind: 'scalar', path: 'p', ...over,
    })
    expect(compareOps(mk({ lamport: 1 }), mk({ lamport: 2 }))).toBeLessThan(0)
    expect(compareOps(mk({ lamport: 2, clientId: 'A' }), mk({ lamport: 2, clientId: 'B' }))).toBeLessThan(0)
    expect(compareOps(mk({ clientId: 'A', id: 'a' }), mk({ clientId: 'A', id: 'b' }))).toBeLessThan(0)
  })
})
