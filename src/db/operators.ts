import { genLocalId, type RecordAuthor } from '@triage-link/core'
import { db } from './database'
import { sha256Hex } from './crypto'

// Local operator roster for a shared field device — no backend. Each saved
// record and audit entry is attributed to the active operator, and roles gate
// the admin views (audit log + operator management). This is RBAC-LITE: an
// offline, single-device soft gate (an optional PIN, not real authentication),
// useful for attribution and basic separation of duties.
//
// Default / community use has an EMPTY roster → everything is open and records
// are unattributed, exactly as before. Adding operators opts in to attribution
// and gating.

export type Role = 'field' | 'lead' | 'admin'
export interface Operator {
  id: string
  name: string
  role: Role
  /** sha256(`${id}:${pin}`) — a soft gate, present only if a PIN was set. */
  pinHash?: string
}

const ACTIVE_KEY = 'operator.active'

let active: Operator | null = null
let rosterEmpty = true

// ---- pub/sub (useSyncExternalStore needs a stable snapshot reference) ----
interface OperatorView { active: Operator | null; rosterEmpty: boolean }
let snap: OperatorView = { active: null, rosterEmpty: true }
const listeners = new Set<() => void>()
function changed() {
  snap = { active, rosterEmpty }
  listeners.forEach((l) => l())
}
export function subscribeOperators(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getOperatorSnapshot = (): OperatorView => snap

export const getActiveOperator = (): Operator | null => active

/** Attribution snapshot for a new record (null when unattributed). */
export const authorSnapshot = (): RecordAuthor | undefined =>
  active ? { id: active.id, name: active.name } : undefined

// ---- RBAC-lite gates (read fresh module state; re-rendered via the hook) ----
/** Admin views (audit log) — open with no roster, else a signed-in lead/admin. */
export const canViewAdmin = (): boolean => rosterEmpty || (!!active && active.role !== 'field')
/** Managing operators — open while nobody is signed in (bootstrap / kiosk setup
 *  and recovery), then admin-only once an operator is on duty. */
export const canManageOperators = (): boolean => !active || active.role === 'admin'
/** The gated Admin area (calibrator, EHR lab, audit, operators). STRICT: an
 *  operator with role 'admin' must be signed in — not bootstrap-open — so the
 *  entry stays hidden on field/fresh devices (and out of the guided tour). */
export const isAdminOnDuty = (): boolean => active?.role === 'admin'

async function refreshRoster() {
  rosterEmpty = (await db.operators.count()) === 0
}

export function listOperators(): Promise<Operator[]> {
  return db.operators.orderBy('name').toArray()
}

export async function addOperator(name: string, role: Role, pin?: string): Promise<Operator> {
  const op: Operator = { id: genLocalId('op-'), name: name.trim(), role }
  if (pin) op.pinHash = await sha256Hex(`${op.id}:${pin}`)
  await db.operators.add(op)
  await refreshRoster()
  changed()
  return op
}

/** Set or clear an operator's PIN (the "login password" used for step-up
 *  re-auth on sensitive actions). An empty pin removes it. */
export async function setOperatorPin(id: string, pin: string): Promise<void> {
  const patch = { pinHash: pin ? await sha256Hex(`${id}:${pin}`) : undefined }
  await db.operators.update(id, patch) // Dexie deletes the key when pinHash is undefined
  if (active?.id === id) active = { ...active, ...patch }
  changed()
}

export async function setRole(id: string, role: Role): Promise<void> {
  await db.operators.update(id, { role })
  if (active?.id === id) active = { ...active, role }
  changed()
}

export async function removeOperator(id: string): Promise<void> {
  await db.operators.delete(id)
  if (active?.id === id) { active = null; await db.meta.delete(ACTIVE_KEY) }
  await refreshRoster()
  changed()
}

/** Clear the PIN on every admin operator (recovery: restores PIN-less sign-in so
 *  a locked-out admin can get back in and set a new PIN). Returns how many were
 *  cleared. Leaves non-admin operators and all records untouched. */
export async function clearAdminPins(): Promise<number> {
  const admins = (await db.operators.toArray()).filter((o) => o.role === 'admin' && o.pinHash)
  for (const op of admins) await setOperatorPin(op.id, '')
  return admins.length
}

/** Last-resort recovery: drop the whole operator roster + active selection so the
 *  device is usable again. CASUALTY RECORDS AND THE AUDIT LOG ARE NOT TOUCHED —
 *  this only clears sign-ins/PINs. */
export async function resetAllOperators(): Promise<void> {
  await db.operators.clear()
  active = null
  await db.meta.delete(ACTIVE_KEY)
  await refreshRoster()
  changed()
}

/** True if the operator has no PIN, or the PIN matches. */
export async function verifyPin(id: string, pin: string): Promise<boolean> {
  const op = await db.operators.get(id)
  if (!op) return false
  if (!op.pinHash) return true
  return op.pinHash === (await sha256Hex(`${id}:${pin}`))
}

export async function setActiveOperator(id: string | null): Promise<void> {
  if (id == null) { active = null; await db.meta.delete(ACTIVE_KEY); changed(); return }
  const op = await db.operators.get(id)
  if (!op) return
  active = op
  await db.meta.put({ key: ACTIVE_KEY, value: id })
  changed()
}

/** Load roster + the persisted active operator at startup. */
export async function initOperators(): Promise<void> {
  await refreshRoster()
  const id = (await db.meta.get(ACTIVE_KEY))?.value
  active = id ? (await db.operators.get(id)) ?? null : null
  changed()
}

/** Test-only reset of in-memory state (does not touch the database). */
export function _resetOperatorsForTests() {
  active = null
  rosterEmpty = true
  snap = { active: null, rosterEmpty: true }
}
