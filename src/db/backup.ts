import type { CasualtyRecord } from '@triage-link/core'
import { recordRepo } from './repository'

// Whole-database backup & restore. Everything lives only in this device's
// IndexedDB, so a cleared browser or lost phone means total data loss — this is
// the safety net. The backup is a single self-contained JSON file with photos
// embedded (records are rehydrated on export), so it restores anywhere even if
// the blob store is empty.

const APP = 'triage-link'
const FORMAT = 1

export interface Backup {
  app: typeof APP
  format: number
  exportedAt: number
  records: CasualtyRecord[]
}

/** Snapshot every record (photos embedded) into a portable backup object. */
export async function exportAll(): Promise<Backup> {
  const stubs = await recordRepo.list()
  const records = (await Promise.all(stubs.map((r) => recordRepo.get(r.id)))).filter(
    (r): r is CasualtyRecord => !!r,
  )
  return { app: APP, format: FORMAT, exportedAt: Date.now(), records }
}

/** Parse + validate untrusted JSON into a Backup, or throw a friendly error. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  const b = data as Partial<Backup>
  if (!b || b.app !== APP || !Array.isArray(b.records)) {
    throw new Error('This file is not a TRIAGE-LINK backup.')
  }
  return b as Backup
}

export type ImportMode = 'merge' | 'replace'

/**
 * Restore a backup.
 *  - replace: wipe all local data first, then import every record.
 *  - merge: import, but keep whichever copy is newer for duplicate IDs.
 */
export async function importBackup(backup: Backup, mode: ImportMode): Promise<number> {
  if (mode === 'replace') {
    await recordRepo.clear()
  }
  const existing = mode === 'merge' ? new Map((await recordRepo.list()).map((r) => [r.id, r.updatedAt])) : null
  let imported = 0
  for (const rec of backup.records) {
    if (existing) {
      const cur = existing.get(rec.id)
      if (cur != null && cur >= (rec.updatedAt ?? 0)) continue // local copy is newer/equal
    }
    await recordRepo.save({ ...rec })
    imported++
  }
  return imported
}
