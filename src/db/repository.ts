import Dexie from 'dexie'
import { db } from './database'
import { diffToOps, type CasualtyRecord } from '@triage-link/core'
import { getClientId, getLamport } from './oplog'
import { isDataUrl, isPhotoRef, putPhoto, readPhoto } from './photos'
import { getKey, isEnabled, isRequired } from './vault'
import { sealRecord, openRecord, sealOp, VaultLockedError } from './record-crypto'
import { audit } from './audit'
import { authorSnapshot } from './operators'

// Thin repository over IndexedDB, wrapped with an append-only op-log: every save
// journals the field/item changes as immutable ops (for conflict-aware sync)
// inside the same transaction as the record write. The public interface is
// unchanged, so the UI is unaffected.
//
// Photos are stored out-of-line as Blobs (see db/photos.ts): records persist a
// light "idb:<id>" reference, which the repo DEHYDRATES on save and REHYDRATES
// to a data URL on get(). list() intentionally skips rehydration — the sidebar
// and board never render photo bytes, so they stay lightweight.
//
// When the photo vault is unlocked, record + op rows are also sealed (encrypted)
// at rest via db/record-crypto.ts: save() seals on write, get()/list() open on
// read. With the vault off, getKey() is null and every seal/open is a pass-
// through, so behaviour is byte-for-byte the same as before.

/** Swap embedded data-URL photos for stored blob references. */
async function dehydrate(record: CasualtyRecord): Promise<CasualtyRecord> {
  const injuries = await Promise.all(
    record.injuries.map(async (inj) => ({
      ...inj,
      photos: await Promise.all(inj.photos.map((p) => (isDataUrl(p) ? putPhoto(p) : Promise.resolve(p)))),
    })),
  )
  return { ...record, injuries }
}

/** Resolve blob references back to data URLs for display/edit. */
async function rehydrate(record: CasualtyRecord): Promise<CasualtyRecord> {
  const injuries = await Promise.all(
    record.injuries.map(async (inj) => ({
      ...inj,
      photos: await Promise.all(inj.photos.map(async (p) => (isPhotoRef(p) ? (await readPhoto(p)) ?? p : p))),
    })),
  )
  return { ...record, injuries }
}

const collectRefs = (record: CasualtyRecord | undefined): Set<string> => {
  const refs = new Set<string>()
  record?.injuries.forEach((i) => i.photos.forEach((p) => { if (isPhotoRef(p)) refs.add(p) }))
  return refs
}

export const recordRepo = {
  async save(record: CasualtyRecord): Promise<void> {
    // Never write plaintext PHI while the vault is enabled-but-locked (e.g. a
    // debounced save firing just after auto-lock) OR required-but-not-yet-set-up;
    // the edit re-saves on the next change once the vault is unlocked.
    if ((isEnabled() || isRequired()) && !getKey()) return
    record.updatedAt = Date.now()
    // Attribute the record to the active operator on creation (if any), kept as
    // a snapshot so it survives the operator later being renamed/removed.
    if (!record.author) {
      const author = authorSnapshot()
      if (author) record.author = author
    }
    let wasCreate = false
    await db.transaction('rw', db.records, db.ops, db.meta, db.photos, async () => {
      const key = getKey()
      const prevStored = await db.records.get(record.id)
      wasCreate = !prevStored
      const prev = prevStored ? await Dexie.waitFor(openRecord(key, prevStored)) : undefined
      const persist = await dehydrate(record)
      const clientId = await getClientId()
      let lamport = await getLamport()
      const ops = diffToOps(prev, persist, {
        recordId: record.id,
        clientId,
        nextLamport: () => ++lamport,
        now: () => Date.now(),
      })
      await db.records.put(await Dexie.waitFor(sealRecord(key, persist)))
      if (ops.length > 0) {
        await db.ops.bulkAdd(await Dexie.waitFor(Promise.all(ops.map((o) => sealOp(key, o)))))
        await db.meta.put({ key: 'lamport', value: String(lamport) })
      }
      // Garbage-collect photo blobs the record no longer references.
      const keep = collectRefs(persist)
      for (const ref of collectRefs(prev)) {
        if (!keep.has(ref)) await db.photos.delete(ref.slice('idb:'.length))
      }
    })
    // Audit creation only; per-field edits are already journaled in the op-log,
    // so auditing every debounced autosave would only add noise.
    if (wasCreate) await audit('record.create', { recordId: record.id })
  },
  async get(id: string): Promise<CasualtyRecord | undefined> {
    const rec = await db.records.get(id)
    if (!rec) return undefined
    try {
      return rehydrate(await openRecord(getKey(), rec))
    } catch (e) {
      if (e instanceof VaultLockedError) return undefined // locked → no access
      throw e
    }
  },
  async list(): Promise<CasualtyRecord[]> {
    const key = getKey()
    const rows = await db.records.orderBy('updatedAt').reverse().toArray()
    const out: CasualtyRecord[] = []
    for (const row of rows) {
      try { out.push(await openRecord(key, row)) } catch (e) { if (!(e instanceof VaultLockedError)) throw e }
    }
    return out // sealed rows are silently skipped while locked (UI is gated)
  },
  async remove(id: string): Promise<void> {
    // Purge the record, its op-log entries, AND its photo blobs together, so a
    // later syncWithServer can't re-upload orphaned ops and resurrect it, and
    // no dangling blobs are left behind.
    await db.transaction('rw', db.records, db.ops, db.photos, async () => {
      const prevStored = await db.records.get(id)
      let prev: CasualtyRecord | undefined
      if (prevStored) {
        try { prev = await Dexie.waitFor(openRecord(getKey(), prevStored)) } catch { prev = undefined }
      }
      await db.records.delete(id)
      await db.ops.where('recordId').equals(id).delete()
      for (const ref of collectRefs(prev)) await db.photos.delete(ref.slice('idb:'.length))
    })
    await audit('record.delete', { recordId: id })
  },
  /** Wipe every record, op, and photo blob (used by backup "replace"). */
  async clear(): Promise<void> {
    await db.transaction('rw', db.records, db.ops, db.photos, db.meta, async () => {
      await db.records.clear()
      await db.ops.clear()
      await db.photos.clear()
      // Drop the sync checkpoints: the op-log is gone, so the next sync must
      // re-pull full state (cursor) and re-push everything (acked) rather than
      // resuming past now-meaningless markers.
      await db.meta.delete('sync.cursor')
      await db.meta.delete('sync.acked')
    })
  },
}
