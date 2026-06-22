import { db } from './database'
import { diffToOps, type CasualtyRecord } from '@triage-link/core'
import { getClientId, getLamport } from './oplog'

// Thin repository over IndexedDB, wrapped with an append-only op-log: every save
// journals the field/item changes as immutable ops (for conflict-aware sync)
// inside the same transaction as the record write. The public interface is
// unchanged, so the UI is unaffected.
export const recordRepo = {
  async save(record: CasualtyRecord): Promise<void> {
    record.updatedAt = Date.now()
    await db.transaction('rw', db.records, db.ops, db.meta, async () => {
      const prev = await db.records.get(record.id)
      const clientId = await getClientId()
      let lamport = await getLamport()
      const ops = diffToOps(prev, record, {
        recordId: record.id,
        clientId,
        nextLamport: () => ++lamport,
        now: () => Date.now(),
      })
      await db.records.put(record)
      if (ops.length > 0) {
        await db.ops.bulkAdd(ops)
        await db.meta.put({ key: 'lamport', value: String(lamport) })
      }
    })
  },
  get(id: string): Promise<CasualtyRecord | undefined> {
    return db.records.get(id)
  },
  list(): Promise<CasualtyRecord[]> {
    return db.records.orderBy('updatedAt').reverse().toArray()
  },
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.records, db.ops, async () => {
      await db.records.delete(id)
      await db.ops.where('recordId').equals(id).delete()
    })
  },
}
