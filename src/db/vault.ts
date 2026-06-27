import Dexie from 'dexie'
import { db } from './database'
import { deriveKey, randomSaltB64, encryptBytes, decryptBytes, encryptString, decryptString, VAULT_CHECK_PLAINTEXT } from './crypto'
import { encryptAllRecords, decryptAllRecords, encryptAllOps, decryptAllOps } from './record-crypto'

// Opt-in "photo vault": when enabled, wound-photo bytes are encrypted at rest
// (AES-256-GCM, key derived from a passphrase via PBKDF2). Photos are the
// heaviest and most sensitive PHI and live out-of-line as opaque blobs, so
// encrypting them needs no schema or sync change — see db/photos.ts, which
// reads getKey() to transparently decrypt on load and encrypt on save.
//
// The derived key lives only in memory while UNLOCKED; locking drops it. A
// passphrase verifier (an encrypted known string) is persisted so unlock can
// reject a wrong passphrase without touching any photo. The vault is default
// OFF — with no config row, every path below is a no-op and storage behaves
// exactly as before.

const PBKDF2_ITER = 210_000
const META_KEY = 'vault'
export const DEFAULT_AUTOLOCK_MS = 5 * 60_000 // lock after 5 min of inactivity

interface VaultConfig {
  salt: string
  iter: number
  check: string // encryptString(key, VAULT_CHECK_PLAINTEXT)
}

export type VaultState = 'disabled' | 'locked' | 'unlocked'

let key: CryptoKey | null = null
let enabled = false
let autoLockTimer: number | undefined
let autoLockMs = DEFAULT_AUTOLOCK_MS

// ---- tiny pub/sub so React (useSyncExternalStore) can track lock state ----
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function getState(): VaultState {
  if (!enabled) return 'disabled'
  return key ? 'unlocked' : 'locked'
}

/** The in-memory key for transparent photo crypto, or null when locked/disabled. */
export const getKey = (): CryptoKey | null => key

async function readConfig(): Promise<VaultConfig | null> {
  const row = await db.meta.get(META_KEY)
  if (!row) return null
  try {
    return JSON.parse(row.value) as VaultConfig
  } catch {
    return null
  }
}

/** Load persisted vault status at startup (enabled but locked until unlocked). */
export async function initVault(): Promise<VaultState> {
  enabled = (await readConfig()) != null
  key = null
  emit()
  return getState()
}

export const isEnabled = (): boolean => enabled

// ---- auto-lock ----
function clearAutoLock() {
  if (autoLockTimer != null) { clearTimeout(autoLockTimer); autoLockTimer = undefined }
}
function armAutoLock() {
  clearAutoLock()
  if (key && autoLockMs > 0) autoLockTimer = setTimeout(() => lock(), autoLockMs) as unknown as number
}
/** Reset the inactivity timer (call on user activity while unlocked). */
export function noteActivity() {
  if (key) armAutoLock()
}
export function setAutoLockMs(ms: number) {
  autoLockMs = ms
  armAutoLock()
}

export function lock() {
  if (!key) return
  key = null
  clearAutoLock()
  emit()
}

// Photo re-encryption migrations. WebCrypto promises are wrapped in
// Dexie.waitFor so the surrounding Dexie transaction stays alive across the
// (non-Dexie) await instead of auto-committing — keeping each migration atomic.

/** Re-encrypt every still-plaintext photo under the given key (used on enable). */
async function encryptAllPhotos(k: CryptoKey): Promise<void> {
  await db.transaction('rw', db.photos, async () => {
    const rows = await db.photos.toArray()
    for (const row of rows) {
      if (row.iv) continue // already encrypted
      const { iv, ct } = await Dexie.waitFor(encryptBytes(k, row.bytes))
      await db.photos.put({ ...row, bytes: ct, iv })
    }
  })
}

/** Decrypt every encrypted photo back to plaintext (used on disable). */
async function decryptAllPhotos(k: CryptoKey): Promise<void> {
  await db.transaction('rw', db.photos, async () => {
    const rows = await db.photos.toArray()
    for (const row of rows) {
      if (!row.iv) continue
      const bytes = await Dexie.waitFor(decryptBytes(k, row.iv, row.bytes))
      await db.photos.put({ id: row.id, mime: row.mime, bytes })
    }
  })
}

/**
 * Turn the vault on: derive a key from the passphrase, persist the verifier,
 * then encrypt all existing photos, records, and op-log entries at rest, leaving
 * the vault unlocked. Idempotent-safe: throws if already enabled.
 *
 * The verifier + key are committed BEFORE sealing data so a crash mid-migration
 * leaves the vault enabled and every row still openable on unlock (sealed and
 * plaintext rows both read correctly) — data is never orphaned.
 */
export async function enableVault(passphrase: string): Promise<void> {
  if (enabled) throw new Error('Vault is already enabled.')
  const salt = randomSaltB64()
  const k = await deriveKey(passphrase, salt, PBKDF2_ITER)
  const config: VaultConfig = { salt, iter: PBKDF2_ITER, check: await encryptString(k, VAULT_CHECK_PLAINTEXT) }
  await db.meta.put({ key: META_KEY, value: JSON.stringify(config) })
  key = k
  enabled = true
  emit()
  await encryptAllPhotos(k)
  await encryptAllRecords(k)
  await encryptAllOps(k)
  armAutoLock()
}

/** Unlock with a passphrase; returns false (and stays locked) if it's wrong. */
export async function unlock(passphrase: string): Promise<boolean> {
  const config = await readConfig()
  if (!config) return false
  const k = await deriveKey(passphrase, config.salt, config.iter)
  try {
    if ((await decryptString(k, config.check)) !== VAULT_CHECK_PLAINTEXT) return false
  } catch {
    return false // wrong passphrase → GCM auth failure
  }
  key = k
  enabled = true
  armAutoLock()
  emit()
  return true
}

/** Turn the vault off: requires the passphrase, decrypts photos, records, and
 *  ops back to plaintext. The config row is removed LAST so a crash mid-decrypt
 *  leaves the vault enabled and the data readable on unlock. */
export async function disableVault(passphrase: string): Promise<boolean> {
  const config = await readConfig()
  if (!config) { enabled = false; emit(); return true }
  const k = await deriveKey(passphrase, config.salt, config.iter)
  try {
    if ((await decryptString(k, config.check)) !== VAULT_CHECK_PLAINTEXT) return false
  } catch {
    return false
  }
  await decryptAllPhotos(k)
  await decryptAllRecords(k)
  await decryptAllOps(k)
  await db.meta.delete(META_KEY)
  key = null
  enabled = false
  clearAutoLock()
  emit()
  return true
}

/** Test-only reset of in-memory state (does not touch the database). */
export function _resetForTests() {
  key = null
  enabled = false
  autoLockMs = DEFAULT_AUTOLOCK_MS
  clearAutoLock()
}
