import Dexie, { type Table } from 'dexie'
import { diffToOps, type CasualtyRecord, type Op } from '@triage-link/core'
import type { SealedRecord, SealedOp } from './record-crypto'
import type { Operator } from './operators'

/** Sync bookkeeping: persistent clientId and the device's Lamport clock. */
export interface MetaRow {
  key: string
  value: string
}

/** One append-only, hash-chained audit-log entry (see db/audit.ts). Holds only
 *  non-PHI metadata (UUIDs, action categories, timestamps), so it stays in the
 *  clear and stays readable for a security review even when the vault is locked. */
export interface AuditEntry {
  /** Auto-increment insertion order (Dexie assigns it). */
  seq?: number
  id: string
  ts: number
  actor: string
  action: string
  recordId?: string
  detail?: string
  /** Hash of the previous entry — links the chain. */
  prevHash: string
  /** SHA-256 over this entry's canonical content + prevHash. */
  hash: string
}

/** A wound photo's bytes, stored out-of-line from the record (see db/photos.ts).
 *  Raw bytes + mime (not a Blob) so they structured-clone cleanly across every
 *  IndexedDB implementation. */
export interface PhotoRow {
  id: string
  mime: string
  /** Raw bytes when stored in the clear, or AES-GCM ciphertext when `iv` is set. */
  bytes: Uint8Array
  /** Present only when the vault is enabled: the 12-byte AES-GCM IV for `bytes`.
   *  `mime` is non-PHI and stays in the clear so the type survives without a key. */
  iv?: Uint8Array
}

// IndexedDB store. Works fully offline; the unit of sync is one record.
export class TriageDB extends Dexie {
  // Rows may be plaintext or vault-sealed (see db/record-crypto.ts); the
  // repository seals on write and opens on read.
  records!: Table<CasualtyRecord | SealedRecord, string>
  ops!: Table<Op | SealedOp, string>
  meta!: Table<MetaRow, string>
  photos!: Table<PhotoRow, string>
  audit!: Table<AuditEntry, number>
  operators!: Table<Operator, string>

  constructor() {
    super('triage-link')
    this.version(1).stores({
      records: 'id, updatedAt',
    })
    // v2: append-only op-log + sync metadata (clientId, Lamport clock).
    this.version(2)
      .stores({
        records: 'id, updatedAt',
        ops: 'id, recordId, lamport',
        meta: 'key',
      })
      // Backfill: existing v1 records have no ops, but resolve() rebuilds state
      // from ops alone. Journal each existing record as a full initial op set
      // (diff from nothing) so sync can't drop untouched pre-upgrade fields.
      .upgrade(async (tx) => {
        const clientId = `dev-${Math.random().toString(36).slice(2, 10)}`
        let lamport = 0
        const records = (await tx.table('records').toArray()) as CasualtyRecord[]
        const ops: Op[] = []
        for (const rec of records) {
          ops.push(
            ...diffToOps(undefined, rec, {
              recordId: rec.id,
              clientId,
              nextLamport: () => (lamport += 1),
              now: () => rec.updatedAt ?? rec.createdAt ?? Date.now(),
            }),
          )
        }
        if (ops.length) await tx.table('ops').bulkAdd(ops)
        await tx.table('meta').bulkPut([
          { key: 'clientId', value: clientId },
          { key: 'lamport', value: String(lamport) },
        ])
      })
    // v3: out-of-line photo blob store. New empty table; existing records keep
    // their embedded data URLs and migrate to blobs on their next save.
    this.version(3).stores({
      records: 'id, updatedAt',
      ops: 'id, recordId, lamport',
      meta: 'key',
      photos: 'id',
    })
    // v4: append-only, hash-chained audit log. New empty table; `++seq` gives a
    // monotonic insertion order, `ts` is indexed for time-range queries.
    this.version(4).stores({
      records: 'id, updatedAt',
      ops: 'id, recordId, lamport',
      meta: 'key',
      photos: 'id',
      audit: '++seq, ts',
    })
    // v5: local operator roster (attribution + RBAC-lite). New empty table.
    this.version(5).stores({
      records: 'id, updatedAt',
      ops: 'id, recordId, lamport',
      meta: 'key',
      photos: 'id',
      audit: '++seq, ts',
      operators: 'id, name',
    })
  }
}

export const db = new TriageDB()
