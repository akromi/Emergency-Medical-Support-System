import Dexie from 'dexie'
import { genLocalId } from '@triage-link/core'
import { db, type AuditEntry } from './database'
import { sha256Hex } from './crypto'
import { getClientId } from './oplog'
import { getActiveOperator } from './operators'

// Append-only, hash-chained audit log. Every entry records a non-PHI event
// (UUIDs, an action category, a timestamp) and links to the previous entry via
// `prevHash`, with `hash = SHA-256(canonical(entry))`. Tampering with — or
// deleting — any entry breaks the chain, which verifyAudit() detects without a
// server. There is intentionally no update/delete API: the log is append-only.
//
// Entries hold no PHI, so they stay in the clear (like the op-log's index keys)
// and remain reviewable even when the vault is locked.

export type AuditAction =
  | 'record.create' | 'record.view' | 'record.delete' | 'record.export'
  | 'backup.create' | 'backup.restore'
  | 'vault.enable' | 'vault.disable' | 'vault.unlock' | 'vault.lock'

const HEAD_KEY = 'audit.head'
const GENESIS = 'genesis'

/** Deterministic serialization of the hashed fields (order matters). */
const canonical = (e: Omit<AuditEntry, 'seq' | 'hash'>): string =>
  JSON.stringify([e.id, e.ts, e.actor, e.action, e.recordId ?? null, e.detail ?? null, e.prevHash])

/** The actor for new entries — the active operator if one is selected, else the
 *  device id (community / single-user use). */
async function actor(): Promise<string> {
  const op = getActiveOperator()
  return op ? `${op.name} (${op.role})` : getClientId()
}

/**
 * Append an audit event. Reads the chain head, hashes, and writes the entry +
 * new head in one transaction so concurrent calls can't fork the chain. Never
 * throws into the caller's critical path — audit failures are swallowed (the log
 * is supplementary, not the source of truth).
 */
export async function audit(action: AuditAction, opts: { recordId?: string; detail?: string } = {}): Promise<void> {
  try {
    await db.transaction('rw', db.audit, db.meta, async () => {
      const prevHash = (await db.meta.get(HEAD_KEY))?.value ?? GENESIS
      const base = {
        id: genLocalId('au-'),
        ts: Date.now(),
        actor: await actor(),
        action,
        recordId: opts.recordId,
        detail: opts.detail,
        prevHash,
      }
      const hash = await Dexie.waitFor(sha256Hex(canonical(base)))
      await db.audit.add({ ...base, hash })
      await db.meta.put({ key: HEAD_KEY, value: hash })
    })
  } catch {
    /* never let auditing break the operation it records */
  }
}

/** All entries in insertion order (oldest first). */
export function listAudit(): Promise<AuditEntry[]> {
  return db.audit.orderBy('seq').toArray()
}

/** Re-walk the chain and confirm every link + hash. Returns the first break. */
export async function verifyAudit(): Promise<{ ok: boolean; brokenAtSeq?: number; count: number }> {
  const all = await listAudit()
  let prev = GENESIS
  for (const e of all) {
    const expected = await sha256Hex(canonical(e))
    if (e.prevHash !== prev || e.hash !== expected) {
      return { ok: false, brokenAtSeq: e.seq, count: all.length }
    }
    prev = e.hash
  }
  return { ok: true, count: all.length }
}
