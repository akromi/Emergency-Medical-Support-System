import { describe, it, expect } from 'vitest'
import {
  ageFromDob, ageBandFromYears, ageBandFromDob,
  gcsTotal, formatGcs, buildAtMist,
  createEmptyRecord,
} from '../src/index'

// Fixed reference instant: 2026-06-24.
const NOW = new Date('2026-06-24T12:00:00Z').getTime()

describe('age from DOB', () => {
  it('computes whole years, accounting for birthday not yet reached', () => {
    expect(ageFromDob('2000-01-01', NOW)).toBe(26)
    expect(ageFromDob('2000-12-31', NOW)).toBe(25) // birthday later this year
    expect(ageFromDob('2026-06-24', NOW)).toBe(0)  // born today
  })

  it('returns null for empty or invalid input', () => {
    expect(ageFromDob('', NOW)).toBeNull()
    expect(ageFromDob('not-a-date', NOW)).toBeNull()
  })
})

describe('Lund–Browder age bands', () => {
  it('maps ages onto the correct band boundaries', () => {
    expect(ageBandFromYears(0)).toBe('infant')
    expect(ageBandFromYears(1)).toBe('age1')
    expect(ageBandFromYears(4)).toBe('age1')
    expect(ageBandFromYears(5)).toBe('age5')
    expect(ageBandFromYears(10)).toBe('age10')
    expect(ageBandFromYears(15)).toBe('age15')
    expect(ageBandFromYears(18)).toBe('adult')
    expect(ageBandFromYears(40)).toBe('adult')
  })

  it('derives a band from a DOB, or null when absent', () => {
    expect(ageBandFromDob('2023-01-01', NOW)).toBe('age1') // 3y
    expect(ageBandFromDob('', NOW)).toBeNull()
  })
})

describe('Glasgow Coma Scale', () => {
  it('totals and formats the components', () => {
    expect(gcsTotal(4, 5, 6)).toBe(15)
    expect(gcsTotal(1, 1, 1)).toBe(3)
    expect(formatGcs(4, 4, 6)).toBe('14 (E4 V4 M6)')
  })
})

describe('AT-MIST handover', () => {
  it('synthesises the six fields from a record', () => {
    const r = createEmptyRecord('CASE-1')
    r.tombstone.dob = '2000-06-24'
    r.tombstone.sex = 'male'
    r.incident.injuryTime = '2026-06-24T11:00'
    r.incident.mechanism = 'RTC'
    r.injuries.push({ id: 'i1', view: 'anterior', x: 1, y: 1, region: 'Left thigh', type: 'laceration', severity: 'severe', notes: '', photos: [] })
    r.vitals.push({ id: 'v1', takenAt: NOW, hr: '120', bp: '90/60', gcs: '14 (E4 V4 M6)' })
    r.treatments.push({ id: 't1', performedAt: NOW, type: 'Tourniquet', detail: 'L thigh', place: 'scene', provider: 'AB' })

    const m = buildAtMist(r, NOW)
    expect(m.age).toBe('26y male')
    expect(m.mechanism).toBe('RTC')
    expect(m.injuries).toContain('Left thigh laceration (severe)')
    expect(m.signs).toContain('HR 120')
    expect(m.signs).toContain('GCS 14')
    expect(m.treatment).toContain('Tourniquet (L thigh)')
  })

  it('falls back to age band and dashes when fields are empty', () => {
    const r = createEmptyRecord('CASE-2')
    const m = buildAtMist(r, NOW)
    expect(m.age).toBe('Adult') // no DOB -> band label
    expect(m.injuries).toBe('—')
    expect(m.signs).toBe('—')
    expect(m.treatment).toBe('—')
  })
})
