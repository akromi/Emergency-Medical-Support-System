import { getActiveOperator, listOperators, verifyPin } from './operators'
import { audit } from './audit'
import { askSecret } from './secret-prompt'

// Step-up re-authentication ("login password") for sensitive actions. When an
// operator is on duty AND has a PIN, guarded actions — viewing the audit log,
// toggling encryption, exporting/restoring data, deleting records, sending PHI
// off-device — first re-prompt for that PIN. Each attempt is written to the
// tamper-evident audit chain.
//
// DEFAULT-OFF: with an empty roster, nobody signed in, or an on-duty operator
// who has no PIN, every gate is a no-op (returns true immediately), so community
// / solo use and the whole test suite behave exactly as before. The gate only
// "bites" once an operator with a PIN is on duty.

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/** Whether a step-up gate currently applies (an operator with a PIN is on duty). */
export function stepUpActive(): boolean {
  const op = getActiveOperator()
  return !!op?.pinHash
}

/**
 * Gate a sensitive action behind the active operator's PIN. Returns true
 * (proceed) immediately when no gate applies. Otherwise prompts for the PIN,
 * records the attempt in the audit log, and returns whether it matched. A
 * cancelled prompt returns false (abort) and is not logged.
 *
 * @param action short code for the action, logged as the audit detail.
 */
export async function requireStepUp(t: Translate, action: string): Promise<boolean> {
  const op = getActiveOperator()
  if (!op?.pinHash) return true
  const pin = await askSecret(t('auth.prompt', { name: op.name }))
  if (pin == null) return false // cancelled — silent, no audit
  const ok = await verifyPin(op.id, pin)
  await audit('auth.stepup', { detail: `${action}:${ok ? 'ok' : 'fail'}` })
  return ok
}

/**
 * Step-up for operator-roster management (add / remove / change PIN). This is
 * privilege-sensitive — unlike the data actions above it can DISABLE the gate
 * itself (e.g. clearing the admin PIN) — so it cannot fall open just because
 * nobody is signed in. Rule: once ANY operator has a PIN, managing the roster
 * requires a valid PIN (the active operator's own when signed in, otherwise any
 * registered operator PIN). It stays open only while no operator has a PIN at
 * all (the community / bootstrap default).
 */
export async function requireManageStepUp(t: Translate): Promise<boolean> {
  const active = getActiveOperator()
  if (active?.pinHash) return requireStepUp(t, 'op.manage') // re-auth against own PIN

  const protectedOps = (await listOperators()).filter((o) => o.pinHash)
  if (protectedOps.length === 0) return true // no PIN anywhere → bootstrap-open
  const pin = await askSecret(t('auth.managePrompt'))
  if (pin == null) return false // cancelled — silent
  let ok = false
  for (const op of protectedOps) if (await verifyPin(op.id, pin)) { ok = true; break }
  await audit('auth.stepup', { detail: `op.manage:${ok ? 'ok' : 'fail'}` })
  return ok
}
