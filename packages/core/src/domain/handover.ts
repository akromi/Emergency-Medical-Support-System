// AT-MIST handover — the standard prehospital structure receiving trauma teams
// expect. Derived (read-only) from the record so the clinician never re-types it.
//   A  Age (and sex)        T  Time of incident       M  Mechanism
//   I  Injuries             S  Signs (latest vitals)  T  Treatments given

import type { CasualtyRecord } from './types.js'
import { AGE_BAND_LABELS } from './types.js'
import { injuryLabel } from './injuries.js'
import { ageFromDob } from './clinical.js'

export interface AtMist {
  age: string
  time: string
  mechanism: string
  injuries: string
  signs: string
  treatment: string
}

const dash = (s: string): string => (s.trim() ? s : '—')

export function buildAtMist(record: CasualtyRecord, nowMs: number): AtMist {
  const { tombstone: t, incident: inc, injuries, vitals, treatments } = record

  const years = ageFromDob(t.dob, nowMs)
  const ageStr = years != null ? `${years}y` : AGE_BAND_LABELS[inc.ageBand]
  const sex = t.sex && t.sex !== 'unknown' ? ` ${t.sex}` : ''

  const injuryStr = injuries.length
    ? injuries.map((i) => `${i.region} ${injuryLabel(i.type).toLowerCase()} (${i.severity})`).join('; ')
    : '—'

  const last = vitals[vitals.length - 1]
  const signs: string[] = []
  if (last) {
    if (last.hr) signs.push(`HR ${last.hr}`)
    if (last.bp) signs.push(`BP ${last.bp}`)
    if (last.rr) signs.push(`RR ${last.rr}`)
    if (last.spo2) signs.push(`SpO₂ ${last.spo2}`)
    if (last.gcs) signs.push(`GCS ${last.gcs}`)
    if (last.pain) signs.push(`Pain ${last.pain}`)
  }

  const treatmentStr = treatments.length
    ? treatments.map((x) => (x.detail ? `${x.type} (${x.detail})` : x.type)).join('; ')
    : '—'

  return {
    age: dash(`${ageStr}${sex}`),
    time: dash(inc.injuryTime),
    mechanism: dash(inc.mechanism),
    injuries: injuryStr,
    signs: signs.length ? signs.join(', ') : '—',
    treatment: treatmentStr,
  }
}
