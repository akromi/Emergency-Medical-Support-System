import Dexie from 'dexie'
import type { CasualtyRecord, Op } from '@triage-link/core'
import { normalizeRecord } from '@triage-link/core'
import { db } from './database'
import { encryptJson, decryptJson } from './crypto'

// Transparent at-rest encryption for the records + op-log tables, used by the
// repository when the photo vault is unlocked (see db/vault.ts). The op-log
// holds the same PHI as the records (resolve() rebuilds a record from its ops),
// so both must be sealed for at-rest encryption to mean anything.
//
// Only PHI-bearing content is encrypted; the indexed / structural keys stay in
// the clear so Dexie can still sort and look up while locked: a record keeps
// `id` + `updatedAt`, an op keeps `id` + `recordId` + `lamport` (all non-PHI —
// UUIDs, a timestamp, a counter). Everything else goes into the `enc` blob.
//
// These helpers are pure w.r.t. the vault (the key is passed in), so this module
// has no import cycle with vault.ts. A null key means "vault off" → pass through
// unchanged, which keeps non-vault users (and the whole default test suite) on
// the exact same plaintext path.

export interface SealedRecord { id: string; updatedAt: number; enc: string }
export interface SealedOp { id: string; recordId: string; lamport: number; enc: string }

type StoredRecord = CasualtyRecord | SealedRecord
type StoredOp = Op | SealedOp

export class VaultLockedError extends Error {
  constructor() { super('The vault is locked.'); this.name = 'VaultLockedError' }
}

export const isSealedRecord = (r: StoredRecord): r is SealedRecord =>
  typeof (r as SealedRecord).enc === 'string'
export const isSealedOp = (o: StoredOp): o is SealedOp =>
  typeof (o as SealedOp).enc === 'string'

/** Encrypt a record for storage (pass through unchanged when key is null). */
export async function sealRecord(key: CryptoKey | null, r: CasualtyRecord): Promise<StoredRecord> {
  if (!key) return r
  return { id: r.id, updatedAt: r.updatedAt ?? 0, enc: await encryptJson(key, r) }
}

/** Decrypt a stored record. Throws VaultLockedError if it's sealed and key is null.
 *  Normalizes the result so records persisted before a field group existed
 *  (e.g. `response`) load with that group defaulted rather than undefined. */
export async function openRecord(key: CryptoKey | null, s: StoredRecord): Promise<CasualtyRecord> {
  if (!isSealedRecord(s)) return normalizeRecord(s)
  if (!key) throw new VaultLockedError()
  return normalizeRecord(await decryptJson<CasualtyRecord>(key, s.enc))
}

/** Encrypt an op for storage (id/recordId/lamport stay clear for indexing). */
export async function sealOp(key: CryptoKey | null, op: Op): Promise<StoredOp> {
  if (!key) return op
  const { id, recordId, lamport, ...rest } = op
  return { id, recordId, lamport, enc: await encryptJson(key, rest) }
}

/** Decrypt a stored op. Throws VaultLockedError if it's sealed and key is null. */
export async function openOp(key: CryptoKey | null, s: StoredOp): Promise<Op> {
  if (!isSealedOp(s)) return s
  if (!key) throw new VaultLockedError()
  const rest = await decryptJson<Omit<Op, 'id' | 'recordId' | 'lamport'>>(key, s.enc)
  return { id: s.id, recordId: s.recordId, lamport: s.lamport, ...rest }
}

// ---- migrations (run inside enable/disable; key passed explicitly) ----
// WebCrypto awaits are wrapped in Dexie.waitFor so the transaction stays alive.

export async function encryptAllRecords(key: CryptoKey): Promise<void> {
  await db.transaction('rw', db.records, async () => {
    for (const r of (await db.records.toArray()) as StoredRecord[]) {
      if (isSealedRecord(r)) continue
      await db.records.put(await Dexie.waitFor(sealRecord(key, r)))
    }
  })
}

export async function decryptAllRecords(key: CryptoKey): Promise<void> {
  await db.transaction('rw', db.records, async () => {
    for (const r of (await db.records.toArray()) as StoredRecord[]) {
      if (!isSealedRecord(r)) continue
      await db.records.put(await Dexie.waitFor(openRecord(key, r)))
    }
  })
}

export async function encryptAllOps(key: CryptoKey): Promise<void> {
  await db.transaction('rw', db.ops, async () => {
    for (const o of (await db.ops.toArray()) as StoredOp[]) {
      if (isSealedOp(o)) continue
      await db.ops.put(await Dexie.waitFor(sealOp(key, o)))
    }
  })
}

export async function decryptAllOps(key: CryptoKey): Promise<void> {
  await db.transaction('rw', db.ops, async () => {
    for (const o of (await db.ops.toArray()) as StoredOp[]) {
      if (!isSealedOp(o)) continue
      await db.ops.put(await Dexie.waitFor(openOp(key, o)))
    }
  })
}
