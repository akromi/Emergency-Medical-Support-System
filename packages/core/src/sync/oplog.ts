// Deterministic, framework-free op-log engine.
//
// Design (NOT last-write-wins at the record level):
//  - Every change is an append-only Op carrying a Lamport clock.
//  - State is the fold of all ops in a TOTAL canonical order
//    (lamport, then clientId, then op id) — so any two replicas holding the
//    same set of ops compute byte-identical state regardless of arrival order.
//  - Scalars resolve per-path; collections resolve per-item-id. Edits to
//    different fields or different items therefore never clobber each other —
//    no lost writes. Only genuine same-target edits pick a deterministic
//    winner (highest Lamport, clientId as tiebreak), and that is reported as a
//    ConflictReport for the audit trail. The losing op is retained in the log.
import {
  createEmptyRecord,
  type CasualtyRecord,
} from '../domain/types.js'
import type { CollectionName, ConflictReport, Op, ResolveResult } from './types.js'

const TOMBSTONE_FIELDS = [
  'name', 'dob', 'sex', 'mrn', 'bloodType', 'address', 'nextOfKin', 'nextOfKinPhone',
] as const
const INCIDENT_FIELDS = ['injuryTime', 'mechanism', 'location', 'triage'] as const
const COLLECTIONS: CollectionName[] = ['injuries', 'vitals', 'treatments']

/** Total order over ops. Lamport is authoritative; clientId and id break ties. */
export function compareOps(a: Op, b: Op): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.clientId !== b.clientId) return a.clientId < b.clientId ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  return 0
}

/** Union two op streams, de-duplicating by id (ops are immutable). */
export function mergeOps(...streams: Op[][]): Op[] {
  const byId = new Map<string, Op>()
  for (const stream of streams) for (const op of stream) if (!byId.has(op.id)) byId.set(op.id, op)
  return [...byId.values()]
}

function setScalar(rec: CasualtyRecord, path: string, value: unknown): void {
  if (path === 'handover') {
    rec.handover = value as CasualtyRecord['handover']
    return
  }
  const [group, field] = path.split('.')
  // group is 'tombstone' | 'incident'; both are flat string/enum maps.
  ;(rec as unknown as Record<string, Record<string, unknown>>)[group][field] = value
}

function getScalar(rec: CasualtyRecord | undefined, path: string): unknown {
  if (!rec) return undefined
  if (path === 'handover') return rec.handover
  const [group, field] = path.split('.')
  return (rec as unknown as Record<string, Record<string, unknown>>)[group][field]
}

/**
 * Fold a set of ops into a single CasualtyRecord plus the conflicts that were
 * resolved. Pure and deterministic: resolve(id, ops) === resolve(id, perm(ops)).
 */
export function resolve(recordId: string, ops: Op[]): ResolveResult {
  const sorted = [...ops].sort(compareOps)
  const rec = createEmptyRecord(recordId)
  if (sorted.length) {
    rec.createdAt = Math.min(...sorted.map((o) => o.ts))
    rec.updatedAt = Math.max(...sorted.map((o) => o.ts))
  }

  // Group ops by target, preserving ascending canonical order within a group.
  const scalarGroups = new Map<string, Op[]>()
  const itemGroups = new Map<string, Op[]>()
  for (const op of sorted) {
    const key = op.kind === 'scalar' ? op.path : `${op.path}#${op.itemId}`
    const map = op.kind === 'scalar' ? scalarGroups : itemGroups
    const list = map.get(key)
    if (list) list.push(op)
    else map.set(key, [op])
  }

  const conflicts: ConflictReport[] = []
  const reportIfContested = (target: string, group: Op[], winner: Op) => {
    if (new Set(group.map((o) => o.clientId)).size >= 2) {
      conflicts.push({
        recordId,
        target,
        winningOpId: winner.id,
        supersededOpIds: group.filter((o) => o.id !== winner.id).map((o) => o.id),
      })
    }
  }

  for (const [path, group] of scalarGroups) {
    const winner = group[group.length - 1] // ascending → last wins
    setScalar(rec, path, winner.value)
    reportIfContested(path, group, winner)
  }

  // Per-item LWW-element-set: latest op (put or remove) decides presence.
  const present = new Map<CollectionName, Array<{ winner: Op; value: unknown }>>()
  for (const [key, group] of itemGroups) {
    const winner = group[group.length - 1]
    const collection = key.split('#')[0] as CollectionName
    if (winner.kind === 'item-put') {
      const arr = present.get(collection) ?? []
      arr.push({ winner, value: winner.value })
      present.set(collection, arr)
    }
    reportIfContested(`${collection}#${winner.itemId}`, group, winner)
  }
  for (const c of COLLECTIONS) {
    const arr = (present.get(c) ?? [])
      .slice()
      .sort((a, b) => compareOps(a.winner, b.winner))
      .map((x) => x.value)
    ;(rec as unknown as Record<string, unknown>)[c] = arr
  }

  return { record: rec, conflicts }
}

export interface OpContext {
  recordId: string
  clientId: string
  /** Returns the next Lamport value (caller persists the advanced clock). */
  nextLamport: () => number
  now?: () => number
  newId?: () => string
}

let counter = 0
function defaultId(clientId: string): string {
  counter += 1
  return `${clientId}-${Date.now().toString(36)}-${counter.toString(36)}`
}

const json = (v: unknown) => JSON.stringify(v)

/**
 * Produce the append-only ops describing the change from `prev` to `next`.
 * Different fields/items yield independent ops, so concurrent edits to
 * distinct targets merge without loss.
 */
export function diffToOps(
  prev: CasualtyRecord | undefined,
  next: CasualtyRecord,
  ctx: OpContext,
): Op[] {
  const ops: Op[] = []
  const now = ctx.now ?? (() => Date.now())
  const newId = ctx.newId ?? (() => defaultId(ctx.clientId))
  const emit = (partial: Omit<Op, 'id' | 'recordId' | 'clientId' | 'lamport' | 'ts'>) => {
    ops.push({
      id: newId(),
      recordId: ctx.recordId,
      clientId: ctx.clientId,
      lamport: ctx.nextLamport(),
      ts: now(),
      ...partial,
    })
  }

  const scalarPaths = [
    ...TOMBSTONE_FIELDS.map((f) => `tombstone.${f}`),
    ...INCIDENT_FIELDS.map((f) => `incident.${f}`),
    'handover',
  ]
  for (const path of scalarPaths) {
    const before = getScalar(prev, path)
    const after = getScalar(next, path)
    if (json(before) !== json(after)) emit({ kind: 'scalar', path, value: after })
  }

  for (const c of COLLECTIONS) {
    const prevItems = new Map((prev?.[c] ?? []).map((i) => [i.id, i]))
    const nextItems = new Map(next[c].map((i) => [i.id, i]))
    for (const [id, item] of nextItems) {
      if (json(prevItems.get(id)) !== json(item)) {
        emit({ kind: 'item-put', path: c, itemId: id, value: item })
      }
    }
    for (const id of prevItems.keys()) {
      if (!nextItems.has(id)) emit({ kind: 'item-remove', path: c, itemId: id })
    }
  }

  return ops
}
