import { db } from './database'
import { diffToOps, type CasualtyRecord } from '@triage-link/core'
import { getClientId, getLamport } from './oplog'
import { isDataUrl, isPhotoRef, putPhoto, readPhoto } from './photos'

// Thin repository over IndexedDB, wrapped with an append-only op-log: every save
// journals the field/item changes as immutable ops (for conflict-aware sync)
// inside the same transaction as the record write. The public interface is
// unchanged, so the UI is unaffected.
//
// Photos are stored out-of-line as Blobs (see db/photos.ts): records persist a
// light "idb:<id>" reference, which the repo DEHYDRATES on save and REHYDRATES
// to a data URL on get(). list() intentionally skips rehydration — the sidebar
// and board never render photo bytes, so they stay lightweight.

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
    record.updatedAt = Date.now()
    await db.transaction('rw', db.records, db.ops, db.meta, db.photos, async () => {
      const prev = await db.records.get(record.id)
      const persist = await dehydrate(record)
      const clientId = await getClientId()
      let lamport = await getLamport()
      const ops = diffToOps(prev, persist, {
        recordId: record.id,
        clientId,
        nextLamport: () => ++lamport,
        now: () => Date.now(),
      })
      await db.records.put(persist)
      if (ops.length > 0) {
        await db.ops.bulkAdd(ops)
        await db.meta.put({ key: 'lamport', value: String(lamport) })
      }
      // Garbage-collect photo blobs the record no longer references.
      const keep = collectRefs(persist)
      for (const ref of collectRefs(prev)) {
        if (!keep.has(ref)) await db.photos.delete(ref.slice('idb:'.length))
      }
    })
  },
  async get(id: string): Promise<CasualtyRecord | undefined> {
    const rec = await db.records.get(id)
    return rec ? rehydrate(rec) : undefined
  },
  list(): Promise<CasualtyRecord[]> {
    return db.records.orderBy('updatedAt').reverse().toArray()
  },
  async remove(id: string): Promise<void> {
    // Purge the record, its op-log entries, AND its photo blobs together, so a
    // later syncWithServer can't re-upload orphaned ops and resurrect it, and
    // no dangling blobs are left behind.
    await db.transaction('rw', db.records, db.ops, db.photos, async () => {
      const prev = await db.records.get(id)
      await db.records.delete(id)
      await db.ops.where('recordId').equals(id).delete()
      for (const ref of collectRefs(prev)) await db.photos.delete(ref.slice('idb:'.length))
    })
  },
  /** Wipe every record, op, and photo blob (used by backup "replace"). */
  async clear(): Promise<void> {
    await db.transaction('rw', db.records, db.ops, db.photos, async () => {
      await db.records.clear()
      await db.ops.clear()
      await db.photos.clear()
    })
  },
}
