// Device-side append-only op-log around the casualty store.
// Every local edit is journaled as immutable ops (see recordRepo.save), which a
// future/optional sync pushes to the conflict-aware sync service and reconciles
// using the SAME deterministic resolver the server uses (@triage-link/core).
import { db } from './database'
import { type CasualtyRecord, type Op } from '@triage-link/core'

async function getMeta(key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

/** Stable per-device id, created once and persisted. */
export async function getClientId(): Promise<string> {
  let id = await getMeta('clientId')
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`
    await db.meta.put({ key: 'clientId', value: id })
  }
  return id
}

/** Current Lamport clock for this device (0 if never set). */
export async function getLamport(): Promise<number> {
  return Number((await getMeta('lamport')) ?? '0')
}

export function listOps(recordId: string): Promise<Op[]> {
  return db.ops.where('recordId').equals(recordId).toArray()
}

export function allOps(): Promise<Op[]> {
  return db.ops.toArray()
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
  const res = await fetch(`${baseUrl}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, ops: localOps }),
  })
  if (!res.ok) throw new Error(`sync failed: ${res.status}`)
  const data = (await res.json()) as { records: Record<string, CasualtyRecord | null>; ops: Op[] }

  await db.transaction('rw', db.records, db.ops, db.meta, async () => {
    const known = new Set((await db.ops.toArray()).map((o) => o.id))
    const incoming = data.ops.filter((o) => !known.has(o.id))
    if (incoming.length) await db.ops.bulkAdd(incoming)

    const maxLamport = data.ops.reduce((m, o) => Math.max(m, o.lamport), await getLamport())
    await db.meta.put({ key: 'lamport', value: String(maxLamport) })

    for (const record of Object.values(data.records)) {
      if (record) await db.records.put(record)
    }
  })
}
