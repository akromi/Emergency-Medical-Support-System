import Dexie, { type Table } from 'dexie'
import type { CasualtyRecord, Op } from '@triage-link/core'

/** Sync bookkeeping: persistent clientId and the device's Lamport clock. */
export interface MetaRow {
  key: string
  value: string
}

// IndexedDB store. Works fully offline; the unit of sync is one record.
export class TriageDB extends Dexie {
  records!: Table<CasualtyRecord, string>
  ops!: Table<Op, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('triage-link')
    this.version(1).stores({
      records: 'id, updatedAt',
    })
    // v2: append-only op-log + sync metadata (clientId, Lamport clock).
    this.version(2).stores({
      records: 'id, updatedAt',
      ops: 'id, recordId, lamport',
      meta: 'key',
    })
  }
}

export const db = new TriageDB()
