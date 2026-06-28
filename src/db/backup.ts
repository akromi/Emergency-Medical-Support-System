import type { CasualtyRecord } from '@triage-link/core'
import { recordRepo } from './repository'
import { deriveKey, randomSaltB64, encryptString, decryptString } from './crypto'
import { getDeployment, hasDeployment, type Deployment } from './deployment'

// Whole-database backup & restore. Everything lives only in this device's
// IndexedDB, so a cleared browser or lost phone means total data loss — this is
// the safety net. The backup is a single self-contained JSON file with photos
// embedded (records are rehydrated on export), so it restores anywhere even if
// the blob store is empty.
//
// A backup contains all PHI in the clear, so it can also be exported
// **passphrase-encrypted** (AES-256-GCM via PBKDF2): the file then carries only
// ciphertext + the KDF salt, unreadable without the passphrase.

const APP = 'triage-link'
const FORMAT = 1
const PBKDF2_ITER = 210_000

export interface Backup {
  app: typeof APP
  format: number
  exportedAt: number
  records: CasualtyRecord[]
  /** Deployment/provenance the export was taken under (present only when set).
   *  Carried for provenance — restore does NOT change the importing device's
   *  deployment, so a donor/coordination handoff never clobbers it. */
  deployment?: Deployment
}

/** Encrypted backup envelope — no plaintext PHI, only ciphertext + KDF params. */
export interface EncryptedBackup {
  app: typeof APP
  enc: 'pbkdf2-aesgcm-v1'
  salt: string
  iter: number
  exportedAt: number
  /** `v1:<iv>:<ct>` over the JSON of a plain Backup. */
  payload: string
}

/** Snapshot every record (photos embedded) into a portable backup object. */
export async function exportAll(): Promise<Backup> {
  const stubs = await recordRepo.list()
  const records = (await Promise.all(stubs.map((r) => recordRepo.get(r.id)))).filter(
    (r): r is CasualtyRecord => !!r,
  )
  const deployment = getDeployment()
  return {
    app: APP, format: FORMAT, exportedAt: Date.now(), records,
    ...(hasDeployment(deployment) ? { deployment } : {}),
  }
}

/** Snapshot + encrypt the whole backup under a passphrase. */
export async function exportEncrypted(passphrase: string): Promise<EncryptedBackup> {
  const backup = await exportAll()
  const salt = randomSaltB64()
  const key = await deriveKey(passphrase, salt, PBKDF2_ITER)
  const payload = await encryptString(key, JSON.stringify(backup))
  return { app: APP, enc: 'pbkdf2-aesgcm-v1', salt, iter: PBKDF2_ITER, exportedAt: backup.exportedAt, payload }
}

/** Shape-check a decoded object as a plain Backup (throws a friendly error). */
function asBackup(data: unknown): Backup {
  const b = data as Partial<Backup>
  if (!b || b.app !== APP || !Array.isArray(b.records)) {
    throw new Error('This file is not a TRIAGE-LINK backup.')
  }
  return b as Backup
}

export function isEncryptedBackup(data: unknown): data is EncryptedBackup {
  const e = data as Partial<EncryptedBackup>
  return !!e && e.app === APP && e.enc === 'pbkdf2-aesgcm-v1' && typeof e.salt === 'string' && typeof e.payload === 'string'
}

/** Parse + validate untrusted JSON into a plain Backup, or throw. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  return asBackup(data)
}

/** Decrypt + validate an encrypted backup envelope under a passphrase. */
export async function decryptBackup(env: EncryptedBackup, passphrase: string): Promise<Backup> {
  const key = await deriveKey(passphrase, env.salt, env.iter)
  let json: string
  try {
    json = await decryptString(key, env.payload)
  } catch {
    throw new Error('Wrong passphrase, or the backup is corrupted.')
  }
  return asBackup(JSON.parse(json))
}

/** Read a backup file's text and report whether it's encrypted (for the UI to
 *  prompt for a passphrase) without throwing on the encrypted case. */
export function readBackupFile(text: string): { encrypted: true; env: EncryptedBackup } | { encrypted: false; backup: Backup } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  if (isEncryptedBackup(data)) return { encrypted: true, env: data }
  return { encrypted: false, backup: asBackup(data) }
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
