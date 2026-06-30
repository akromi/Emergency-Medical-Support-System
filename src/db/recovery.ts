import { db } from './database'
import { sha256Hex, randomSaltB64 } from './crypto'
import { audit } from './audit'
import { clearAdminPins, resetAllOperators } from './operators'

// Admin-access recovery — a layered ladder for when the admin PIN is forgotten:
//   Tier 1  Peer reset      — a second admin clears the PIN (OperatorPanel).
//   Tier 2  Recovery code   — a per-device, one-time code (here) clears admin PINs.
//   Tier 3  Local reset     — last resort: drop all sign-ins, KEEP records (here).
// Only a salted HASH of the recovery code is ever stored; the code itself is
// shown once and never logged. Every path writes a tamper-evident audit entry.

const RECOVERY_KEY = 'op.recovery'
// Unambiguous alphabet (no 0/O/1/I/L) so a hand-written code is unmistakable.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const GROUPS = 3, GROUP_LEN = 4

interface RecoveryRecord { salt: string; hash: string }

/** A grouped, high-entropy code, e.g. "ABCD-EFGH-JKMN" (~60 bits). */
function randomCode(): string {
  const n = GROUPS * GROUP_LEN
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < n; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
    if ((i + 1) % GROUP_LEN === 0 && i + 1 < n) out += '-'
  }
  return out
}

/** Strip formatting/case so "abcd efgh" and "ABCD-EFGH" verify the same. */
const normalize = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

const hashCode = (code: string, salt: string): Promise<string> => sha256Hex(`${salt}:${normalize(code)}`)

async function readRecord(): Promise<RecoveryRecord | null> {
  const raw = (await db.meta.get(RECOVERY_KEY))?.value
  if (!raw) return null
  try { return JSON.parse(raw) as RecoveryRecord } catch { return null }
}

/** Whether a recovery code has been issued on this device. */
export async function recoveryCodeExists(): Promise<boolean> {
  return (await readRecord()) != null
}

/** Issue (or re-issue) a recovery code. Stores only its salted hash and returns
 *  the plaintext to show ONCE. Regenerating invalidates any previous code. */
export async function generateRecoveryCode(): Promise<string> {
  const code = randomCode()
  const salt = randomSaltB64()
  const rec: RecoveryRecord = { salt, hash: await hashCode(code, salt) }
  await db.meta.put({ key: RECOVERY_KEY, value: JSON.stringify(rec) })
  await audit('auth.recovery.issue')
  return code
}

/** Issue a code only if none exists (called when an admin first sets a PIN).
 *  Returns the plaintext to show once, or null if one already existed. */
export async function ensureRecoveryCode(): Promise<string | null> {
  if (await recoveryCodeExists()) return null
  return generateRecoveryCode()
}

export async function verifyRecoveryCode(code: string): Promise<boolean> {
  const rec = await readRecord()
  if (!rec || !normalize(code)) return false
  return rec.hash === (await hashCode(code, rec.salt))
}

/** Tier 2: a correct recovery code clears every admin PIN, so the admin can sign
 *  in PIN-less and set a new one. Returns whether the code was accepted. */
export async function recoverWithCode(code: string): Promise<boolean> {
  const ok = await verifyRecoveryCode(code)
  await audit('auth.recovery.code', { detail: ok ? 'ok' : 'fail' })
  if (ok) await clearAdminPins()
  return ok
}

/** Tier 3 (last resort): clear all operator sign-ins/PINs and the recovery code
 *  on this device. Casualty records and the audit log are kept. */
export async function localResetCredentials(): Promise<void> {
  await audit('auth.recovery.localreset')
  await resetAllOperators()
  await db.meta.delete(RECOVERY_KEY)
}
