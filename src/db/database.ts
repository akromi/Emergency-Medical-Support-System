import Dexie, { type Table } from 'dexie'
import type { CasualtyRecord } from '../domain/types'

// IndexedDB store. Works fully offline; the unit of sync is one record.
export class TriageDB extends Dexie {
  records!: Table<CasualtyRecord, string>

  constructor() {
    super('triage-link')
    this.version(1).stores({
      records: 'id, updatedAt',
    })
  }
}

export const db = new TriageDB()
