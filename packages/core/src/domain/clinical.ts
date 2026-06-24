// Clinical helpers: age/age-band derivation from date of birth, and the
// Glasgow Coma Scale (eye/verbal/motor) calculator. Framework-free and pure
// (callers pass the reference time) so they are trivially unit-testable.

import type { AgeBand } from './types.js'

/** Whole years between `dob` (yyyy-mm-dd) and `nowMs`; null if unparseable. */
export function ageFromDob(dob: string, nowMs: number): number | null {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date(nowMs)
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age < 0 ? null : age
}

/** Map a whole-year age onto the nearest Lund–Browder band. */
export function ageBandFromYears(age: number): AgeBand {
  if (age < 1) return 'infant'
  if (age < 5) return 'age1'
  if (age < 10) return 'age5'
  if (age < 15) return 'age10'
  if (age < 18) return 'age15'
  return 'adult'
}

/** Derive the Lund–Browder band straight from a DOB; null if no/!valid DOB. */
export function ageBandFromDob(dob: string, nowMs: number): AgeBand | null {
  const age = ageFromDob(dob, nowMs)
  return age == null ? null : ageBandFromYears(age)
}

// ---- Glasgow Coma Scale ----

export interface GcsOption { score: number; label: string }

/** Eye-opening response (E), best to worst. */
export const GCS_EYE: GcsOption[] = [
  { score: 4, label: 'Spontaneous' },
  { score: 3, label: 'To speech' },
  { score: 2, label: 'To pain' },
  { score: 1, label: 'None' },
]

/** Verbal response (V), best to worst. */
export const GCS_VERBAL: GcsOption[] = [
  { score: 5, label: 'Oriented' },
  { score: 4, label: 'Confused' },
  { score: 3, label: 'Inappropriate words' },
  { score: 2, label: 'Incomprehensible sounds' },
  { score: 1, label: 'None' },
]

/** Motor response (M), best to worst. */
export const GCS_MOTOR: GcsOption[] = [
  { score: 6, label: 'Obeys commands' },
  { score: 5, label: 'Localises pain' },
  { score: 4, label: 'Withdraws from pain' },
  { score: 3, label: 'Abnormal flexion' },
  { score: 2, label: 'Abnormal extension' },
  { score: 1, label: 'None' },
]

export const gcsTotal = (e: number, v: number, m: number): number => e + v + m

/** "14 (E4 V4 M6)" — total with the component breakdown, for handover. */
export const formatGcs = (e: number, v: number, m: number): string =>
  `${gcsTotal(e, v, m)} (E${e} V${v} M${m})`
