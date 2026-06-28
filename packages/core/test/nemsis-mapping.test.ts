import { describe, it, expect } from 'vitest'
import { toNemsisRecord } from '../src/nemsis/mapping.js'
import { createEmptyRecord, type CasualtyRecord } from '../src/domain/types.js'

function sample(): CasualtyRecord {
  const r = createEmptyRecord('CAS-1')
  r.tombstone = { ...r.tombstone, name: 'Doe, Jane', dob: '1990-05-01', sex: 'female', mrn: 'MRN-9' }
  r.incident = { ...r.incident, injuryTime: '2026-06-28T10:00', mechanism: 'Fall from height', location: '123 Main St', triage: 'immediate' }
  r.injuries = [{ id: 'i1', view: 'anterior', x: 1, y: 2, region: 'Chest', type: 'fracture', severity: 'severe', notes: '', photos: [] }]
  r.vitals = [{ id: 'v1', takenAt: 1_700_000_000_000, hr: '120', bp: '90/60', rr: '22', spo2: '94', gcs: '14', pain: '7' }]
  r.treatments = [
    { id: 't1', performedAt: 1_700_000_000_000, type: 'Splint / immobilisation', detail: 'Left arm', place: 'scene', provider: 'AB' },
    { id: 't2', performedAt: 1_700_000_000_000, type: 'Medication', detail: 'Morphine 5mg IV', place: 'enroute', provider: 'AB' },
  ]
  r.handover = { at: 1_700_000_100_000, clinician: 'Dr. Roe', facility: 'General Hospital' }
  return r
}

const sectionEls = (rec: ReturnType<typeof toNemsisRecord>, name: string) =>
  rec.sections.find((s) => s.section === name)?.elements ?? []
const value = (rec: ReturnType<typeof toNemsisRecord>, sectionName: string, elName: string) =>
  sectionEls(rec, sectionName).find((e) => e.name === elName)?.value

describe('toNemsisRecord', () => {
  it('maps identity into ePatient (name split, gender, dob)', () => {
    const n = toNemsisRecord(sample())
    expect(value(n, 'ePatient', 'Patient Last Name')).toBe('Doe')
    expect(value(n, 'ePatient', 'Patient First Name')).toBe('Jane')
    expect(value(n, 'ePatient', 'Patient Date of Birth')).toBe('1990-05-01')
    expect(value(n, 'ePatient', 'Patient Gender')).toBeTruthy()
    expect(sectionEls(n, 'ePatient').find((e) => e.name === 'Patient Last Name')?.id).toBe('ePatient.02')
  })

  it('splits blood pressure into SBP/DBP in eVitals', () => {
    const n = toNemsisRecord(sample())
    expect(value(n, 'eVitals', 'SBP (Systolic Blood Pressure)')).toBe('90')
    expect(value(n, 'eVitals', 'DBP (Diastolic Blood Pressure)')).toBe('60')
    expect(value(n, 'eVitals', 'Total Glasgow Coma Score')).toBe('14')
  })

  it('separates procedures from medications', () => {
    const n = toNemsisRecord(sample())
    expect(value(n, 'eProcedures', 'Procedures Performed')).toEqual(['Splint / immobilisation — Left arm @ scene'])
    expect(value(n, 'eMedications', 'Medications Given')).toEqual(['Morphine 5mg IV @ enroute'])
  })

  it('maps mechanism + injuries into eInjury and disposition from handover/triage', () => {
    const n = toNemsisRecord(sample())
    expect(value(n, 'eInjury', 'Cause of Injury (Mechanism)')).toBe('Fall from height')
    expect(value(n, 'eDisposition', 'Receiving Facility')).toBe('General Hospital')
    expect(value(n, 'eDisposition', 'Triage Classification (field)')).toContain('Immediate')
    expect(n.patientCareReportNumber).toBe('CAS-1')
    expect(n.standard).toBe('NEMSIS')
  })

  it('surfaces conformance gaps and omits empty sections', () => {
    const n = toNemsisRecord(createEmptyRecord('CAS-EMPTY'))
    expect(n.gaps.length).toBeGreaterThan(0)
    expect(n.gaps.some((g) => g.startsWith('eCrew'))).toBe(true)
    // An empty record has no vitals/injuries/treatments → those sections are absent.
    expect(n.sections.some((s) => s.section === 'eVitals')).toBe(false)
  })

  it('reports the eTimes gap when the response time chain is incomplete', () => {
    // sample() has incident.injuryTime but no response chain — eTimes is a gap.
    expect(toNemsisRecord(sample()).gaps.some((g) => g.startsWith('eTimes'))).toBe(true)
  })

  it('maps response context into eResponse and the time chain into eTimes', () => {
    const r = sample()
    r.response = {
      ...r.response,
      agency: 'Toronto Paramedic Services', unit: 'M-12', mode: 'emergent',
      dispatch: '2026-06-28T09:50', atScene: '2026-06-28T09:58',
      atPatient: '2026-06-28T10:00', transport: '2026-06-28T10:20',
      atDestination: '2026-06-28T10:35',
    }
    const n = toNemsisRecord(r)
    expect(value(n, 'eResponse', 'EMS Agency Number')).toBe('Toronto Paramedic Services')
    expect(value(n, 'eResponse', 'EMS Unit / Vehicle Number')).toBe('M-12')
    expect(value(n, 'eResponse', 'Response Mode to Scene')).toBeTruthy()
    // Timestamps are emitted verbatim (raw datetime-local), not tz-coerced.
    expect(value(n, 'eTimes', 'Unit Arrived on Scene Date/Time')).toBe('2026-06-28T09:58')
    expect(value(n, 'eTimes', 'Patient Arrived at Destination Date/Time')).toBe('2026-06-28T10:35')
    // With agency+unit and the full required chain present, both gaps clear.
    expect(n.gaps.some((g) => g.startsWith('eTimes'))).toBe(false)
    expect(n.gaps.some((g) => g.startsWith('eResponse'))).toBe(false)
    // …but eCrew/eScene remain unmet (not captured in this slice).
    expect(n.gaps.some((g) => g.startsWith('eCrew'))).toBe(true)
  })

  it('keeps the eResponse gap when only a partial responder id is given', () => {
    const r = sample()
    r.response = { ...r.response, agency: 'Toronto Paramedic Services' } // unit missing
    expect(toNemsisRecord(r).gaps.some((g) => g.startsWith('eResponse'))).toBe(true)
  })

  it('maps crew into eCrew and scene into eScene, clearing those gaps', () => {
    const r = sample()
    r.crew = [
      { id: 'c1', name: 'A. Medic', role: 'lead', cert: 'PCP' },
      { id: 'c2', name: 'B. Driver', role: 'driver', cert: '' },
    ]
    r.scene = { gps: '43.6532, -79.3832', locationType: 'street', massCasualty: true }
    const n = toNemsisRecord(r)
    expect(value(n, 'eCrew', 'Crew Members')).toEqual(['A. Medic (lead, PCP)', 'B. Driver (driver)'])
    expect(value(n, 'eScene', 'Incident GPS / Location')).toBe('43.6532, -79.3832')
    expect(value(n, 'eScene', 'Incident Location Type')).toBe('Street / Highway')
    expect(value(n, 'eScene', 'Mass Casualty Incident')).toBe('Yes')
    expect(n.gaps.some((g) => g.startsWith('eCrew'))).toBe(false)
    expect(n.gaps.some((g) => g.startsWith('eScene'))).toBe(false)
  })

  it('keeps the eScene gap when GPS is given but location type is not', () => {
    const r = sample()
    r.scene = { gps: '43.6, -79.3', locationType: '', massCasualty: false }
    expect(toNemsisRecord(r).gaps.some((g) => g.startsWith('eScene'))).toBe(true)
  })
})
