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
})
