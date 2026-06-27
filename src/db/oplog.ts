// Device-side append-only op-log around the casualty store.
// Every local edit is journaled as immutable ops (see recordRepo.save), which a
// future/optional sync pushes to the conflict-aware sync service and reconciles
// using the SAME deterministic resolver the server uses (@triage-link/core).
import Dexie from 'dexie'
import { db } from './database'
import { resolve, type CasualtyRecord, type Op } from '@triage-link/core'
import { getKey } from './vault'
import { openOp, sealOp, openRecord, sealRecord } from './record-crypto'

async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

/** Ids of ops the server has acknowledged (so we don't re-push them). Bounded to
 *  the live op-log — pruned on each sync, reset when the log is wiped. */
async function getAckedOpIds(): Promise<Set<string>> {
  const raw = await getMeta('sync.acked')
  if (!raw) return new Set()
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

/**
 * Stable per-device id, created once and persisted. The get-or-create runs in a
 * single `rw` transaction so overlapping callers/tabs can't persist two ids
 * (which would tag one device's ops with multiple authors). When called from
 * within an existing transaction that already covers `meta` (e.g. save()), Dexie
 * reuses the parent transaction.
 */
export async function getClientId(): Promise<string> {
  return db.transaction('rw', db.meta, async () => {
    const existing = (await db.meta.get('clientId'))?.value
    if (existing) return existing
    const id = `dev-${Math.random().toString(36).slice(2, 10)}`
    await db.meta.put({ key: 'clientId', value: id })
    return id
  })
}

/** Current Lamport clock for this device (0 if never set). */
export async function getLamport(): Promise<number> {
  return Number((await getMeta('lamport')) ?? '0')
}

export async function listOps(recordId: string): Promise<Op[]> {
  const key = getKey()
  const rows = await db.ops.where('recordId').equals(recordId).toArray()
  return Promise.all(rows.map((o) => openOp(key, o)))
}

export async function allOps(): Promise<Op[]> {
  const key = getKey()
  return Promise.all((await db.ops.toArray()).map((o) => openOp(key, o)))
}

/**
 * Optional online step: push the local op-log to the sync service and adopt the
 * resolved snapshots + any ops we were missing. The op-log stays append-only
 * (incoming ops are added, never mutated); the merge authority is the server's
 * (== core's) deterministic resolver. No UI depends on this.
 */
export async function syncWithServer(baseUrl: string): Promise<void> {
  const clientId = await getClientId()
  const localOps = await allOps()
  // Narrowed push: send only ops the server hasn't already acknowledged, so a
  // sync uploads the delta instead of the whole local log every time.
  const acked = await getAckedOpIds()
  const toPush = acked.size ? localOps.filter((o) => !acked.has(o.id)) : localOps
  // Incremental pull: send the cursor from our last sync so the server returns
  // only ops appended since it. Absent on the first sync (or after a wipe) → the
  // server replies with full state and we adopt its cursor below.
  const cursor = await getMeta('sync.cursor')
  const body: { clientId: string; ops: Op[]; since?: number } = { clientId, ops: toPush }
  if (cursor != null) body.since = Number(cursor)
  const res = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`sync failed: ${res.status}`)
  const data = (await res.json()) as { records: Record<string, CasualtyRecord | null>; ops: Op[]; cursor?: number }

  const key = getKey()
  await db.transaction('rw', db.records, db.ops, db.meta, async () => {
    // Re-read the local log inside the transaction; it may have grown since the
    // request was sent (another tab or a debounced save). Rows may be vault-
    // sealed at rest — open them to fold, and seal incoming/resolved on write.
    const current = await Dexie.waitFor(Promise.all((await db.ops.toArray()).map((o) => openOp(key, o))))
    const known = new Set(current.map((o) => o.id))
    const incoming = data.ops.filter((o) => !known.has(o.id))
    if (incoming.length) await db.ops.bulkAdd(await Dexie.waitFor(Promise.all(incoming.map((o) => sealOp(key, o)))))

    const allOpsNow = incoming.length ? current.concat(incoming) : current
    const maxLamport = allOpsNow.reduce((m, o) => Math.max(m, o.lamport), await getLamport())
    await db.meta.put({ key: 'lamport', value: String(maxLamport) })

    // Checkpoint the server's high-water cursor so the next sync pulls only the
    // delta. Stored in the same transaction that adopts these ops, so the cursor
    // never advances past ops we failed to persist.
    if (typeof data.cursor === 'number') {
      await db.meta.put({ key: 'sync.cursor', value: String(data.cursor) })
    }

    // Record which ops the server now has — previously-acked ops still present,
    // the ops we just pushed, and the ops it returned — so the next push skips
    // them. Intersected with the live log (no overlap between the three sets) so
    // it stays bounded and drops ids of deleted records.
    const live = new Set(allOpsNow.map((o) => o.id))
    const nextAcked: string[] = []
    for (const id of acked) if (live.has(id)) nextAcked.push(id)
    for (const o of toPush) if (live.has(o.id) && !acked.has(o.id)) nextAcked.push(o.id)
    for (const o of incoming) nextAcked.push(o.id)
    await db.meta.put({ key: 'sync.acked', value: JSON.stringify(nextAcked) })

    // Re-fold each record from the CURRENT local op-log (server ops + any ops
    // appended while the request was in flight) rather than trusting the server
    // snapshot, so the records row never goes stale relative to the log.
    const opsByRecord = new Map<string, Op[]>()
    for (const op of allOpsNow) {
      const list = opsByRecord.get(op.recordId)
      if (list) list.push(op)
      else opsByRecord.set(op.recordId, [op])
    }
    for (const [recordId, recOps] of opsByRecord) {
      const resolved = resolve(recordId, recOps).record
      // updatedAt isn't journaled, and resolve() derives it from op ts; keep the
      // local row's value if it's newer so a just-saved case doesn't sort older
      // in the list after a sync.
      const existingStored = await db.records.get(recordId)
      const existing = existingStored ? await Dexie.waitFor(openRecord(key, existingStored)) : undefined
      if (existing && existing.updatedAt > resolved.updatedAt) {
        resolved.updatedAt = existing.updatedAt
      }
      await db.records.put(await Dexie.waitFor(sealRecord(key, resolved)))
    }
  })
}
