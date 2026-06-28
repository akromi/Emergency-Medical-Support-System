// Data-retention presets — a donor/privacy-friendly maximum retention window.
//
// Humanitarian programs and donors often require that casualty data not be kept
// longer than some period. This is a device-wide setting (a number of days),
// offline and stored in localStorage — no server. It is DEFAULT-OFF (0 days =
// keep indefinitely), so leaving it unset changes nothing.
//
// Enforcement is operator-triggered, never silent: the app surfaces how many
// records are past the window and the operator purges them with a confirmation
// (and the usual step-up gate). We deliberately do NOT auto-delete medical
// records on a timer — destroying PHI must be a deliberate, reviewable act.

export interface Retention {
  /** Maximum age, in days, before a record is eligible for purge. 0 = off. */
  days: number
}

const KEY = 'tl.retention'
const DAY_MS = 86_400_000

/** Selectable retention windows (days). 0 ("off") is offered separately in UI. */
export const RETENTION_PRESETS = [30, 90, 180, 365] as const

const blank = (): Retention => ({ days: 0 })

function load(): Retention {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = (JSON.parse(raw) as Partial<Retention>).days
      if (typeof d === 'number' && Number.isFinite(d) && d >= 0) return { days: Math.floor(d) }
    }
  } catch { /* private mode / bad JSON — fall through to blank */ }
  return blank()
}

let current: Retention = load()
const listeners = new Set<() => void>()

export const getRetention = (): Retention => current
export const isRetentionOn = (r: Retention = current): boolean => r.days > 0

export function setRetention(days: number): void {
  const safe = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0
  current = { days: safe }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* session-only when storage is unavailable */ }
  listeners.forEach((l) => l())
}

/** Subscribe to retention changes (for useSyncExternalStore). */
export function subscribeRetention(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The cutoff timestamp: records created at/before this are past the window.
 *  Null when retention is off. */
export function retentionCutoff(days: number, now: number): number | null {
  return days > 0 ? now - days * DAY_MS : null
}

/** Records past the retention window — those first documented (`createdAt`)
 *  longer ago than `days`. Empty when retention is off. */
export function findExpired<T extends { createdAt: number }>(
  records: T[], days: number, now: number,
): T[] {
  const cutoff = retentionCutoff(days, now)
  if (cutoff == null) return []
  return records.filter((r) => r.createdAt < cutoff)
}
