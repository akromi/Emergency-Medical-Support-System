// WebCrypto primitives for at-rest encryption (offline, no dependency).
// AES-256-GCM for confidentiality + integrity; PBKDF2-SHA-256 to stretch a
// user passphrase into the key. The derived key is held only in memory while
// the vault is unlocked — it is never written to disk, so the on-device data
// (and an exported backup) is unreadable without the passphrase.

const PBKDF2_ITERATIONS = 210_000 // OWASP-recommended floor for PBKDF2-SHA-256
const enc = new TextEncoder()
const dec = new TextDecoder()

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A fresh random salt (16 bytes), base64-encoded — store it alongside the data. */
export function randomSaltB64(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)))
}

/** Derive a non-extractable AES-GCM key from a passphrase + salt. */
export async function deriveKey(passphrase: string, saltB64: string, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt a UTF-8 string → `v1:<ivB64>:<ctB64>` (random 12-byte IV per call). */
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)))
  return `v1:${toB64(iv)}:${toB64(ct)}`
}

/** Decrypt a `v1:<iv>:<ct>` blob. Throws if the key is wrong or data tampered. */
export async function decryptString(key: CryptoKey, blob: string): Promise<string> {
  const [ver, ivB64, ctB64] = blob.split(':')
  if (ver !== 'v1' || !ivB64 || !ctB64) throw new Error('Unrecognised ciphertext format')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64))
  return dec.decode(pt)
}

export const encryptJson = (key: CryptoKey, value: unknown): Promise<string> => encryptString(key, JSON.stringify(value))
export const decryptJson = async <T = unknown>(key: CryptoKey, blob: string): Promise<T> => JSON.parse(await decryptString(key, blob)) as T

/** Encrypt raw bytes (e.g. a photo blob) → ciphertext + the random IV used.
 *  Stored as Uint8Arrays so they structured-clone into IndexedDB unchanged. */
export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource))
  return { iv, ct }
}

/** Decrypt bytes produced by encryptBytes. Throws if key/iv/ct don't match. */
export async function decryptBytes(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource))
}

/** Round-trip check used to validate a passphrase against a stored verifier. */
export const VAULT_CHECK_PLAINTEXT = 'triage-link-vault-v1'

/** SHA-256 of a UTF-8 string, lowercase hex — used to hash-chain the audit log. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
