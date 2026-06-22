import { db } from './database'
import type { CasualtyRecord } from '@triage-link/core'

// Thin repository over IndexedDB. A future sync layer wraps this with an op-log.
export const recordRepo = {
  async save(record: CasualtyRecord): Promise<void> {
    record.updatedAt = Date.now()
    await db.records.put(record)
  },
  get(id: string): Promise<CasualtyRecord | undefined> {
    return db.records.get(id)
  },
  list(): Promise<CasualtyRecord[]> {
    return db.records.orderBy('updatedAt').reverse().toArray()
  },
  async remove(id: string): Promise<void> {
    await db.records.delete(id)
  },
}
