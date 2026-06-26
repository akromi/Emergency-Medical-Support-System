// Elapsed-time helpers for the "time since injury" clock. In trauma, time drives
// decisions (the golden hour, tourniquet duration), so the elapsed interval from
// the recorded injury time is surfaced live in the UI. Framework-free and pure
// (callers pass the reference instant) so it's trivially unit-testable.

/** Units for formatElapsed — overridable so the UI can localise the suffixes. */
export interface ElapsedUnits { d: string; h: string; m: string }
const DEFAULT_UNITS: ElapsedUnits = { d: 'd', h: 'h', m: 'm' }

/**
 * Milliseconds elapsed between `injuryTime` (a datetime-local string,
 * 'YYYY-MM-DDTHH:mm') and `nowMs`. Returns null when the time is empty,
 * unparseable, or in the future — so callers can simply hide the clock.
 */
export function elapsedSince(injuryTime: string, nowMs: number): number | null {
  if (!injuryTime) return null
  const t = new Date(injuryTime).getTime()
  if (Number.isNaN(t)) return null
  const delta = nowMs - t
  return delta < 0 ? null : delta
}

/**
 * Compact elapsed label: "45m", "1h 24m", "2d 3h". Days drop the minutes and
 * hours drop nothing below them; under a minute reads "0m". Unit suffixes are
 * overridable for localisation (e.g. j/h/min in French).
 */
export function formatElapsed(ms: number, units: ElapsedUnits = DEFAULT_UNITS): string {
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days > 0) return `${days}${units.d} ${hours}${units.h}`
  if (hours > 0) return `${hours}${units.h} ${mins}${units.m}`
  return `${mins}${units.m}`
}
