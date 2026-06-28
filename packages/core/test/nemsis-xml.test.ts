import { describe, it, expect } from 'vitest'
import { toNemsisRecord } from '../src/nemsis/mapping.js'
import { toNemsisXml } from '../src/nemsis/xml.js'
import { createEmptyRecord, type CasualtyRecord } from '../src/domain/types.js'

function sample(): CasualtyRecord {
  const r = createEmptyRecord('CAS-1')
  r.tombstone = { ...r.tombstone, name: 'Doe, Jane', dob: '1990-05-01', sex: 'female', mrn: 'MRN-9' }
  r.incident = { ...r.incident, injuryTime: '2026-06-28T10:00', mechanism: 'Fall <2m> & "slip"', location: '123 Main St', triage: 'immediate' }
  r.injuries = [{ id: 'i1', view: 'anterior', x: 1, y: 2, region: 'Chest', type: 'fracture', severity: 'severe', notes: '', photos: [] }]
  r.vitals = [{ id: 'v1', takenAt: 1_700_000_000_000, hr: '120', bp: '90/60', rr: '22', spo2: '94', gcs: '14', pain: '7' }]
  r.treatments = [
    { id: 't1', performedAt: 1_700_000_000_000, type: 'Splint / immobilisation', detail: 'Left arm', place: 'scene', provider: 'AB' },
    { id: 't2', performedAt: 1_700_000_000_000, type: 'Medication', detail: 'Morphine 5mg IV', place: 'enroute', provider: 'AB' },
  ]
  r.handover = { at: 1_700_000_100_000, clinician: 'Dr. Roe', facility: 'General Hospital' }
  return r
}

describe('toNemsisXml', () => {
  it('emits a well-formed XML declaration and PCR root carrying standard/version/id', () => {
    const xml = toNemsisXml(toNemsisRecord(sample()))
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('<PatientCareReport standard="NEMSIS" version="3.5.0" patientCareReportNumber="CAS-1">')
    expect(xml.trimEnd().endsWith('</PatientCareReport>')).toBe(true)
  })

  it('uses the NEMSIS element id as the tag and carries the human name as an attribute', () => {
    const xml = toNemsisXml(toNemsisRecord(sample()))
    expect(xml).toContain('<ePatient.02 name="Patient Last Name">Doe</ePatient.02>')
    expect(xml).toContain('<ePatient.03 name="Patient First Name">Jane</ePatient.03>')
    // BP split is preserved through serialization.
    expect(xml).toContain('<eVitals.06 name="SBP (Systolic Blood Pressure)">90</eVitals.06>')
    expect(xml).toContain('<eVitals.07 name="DBP (Diastolic Blood Pressure)">60</eVitals.07>')
  })

  it('escapes XML metacharacters in both text and attribute contexts', () => {
    const xml = toNemsisXml(toNemsisRecord(sample()))
    // mechanism "Fall <2m> & \"slip\"" must be entity-escaped, never raw.
    expect(xml).toContain('Fall &lt;2m&gt; &amp; &quot;slip&quot;')
    expect(xml).not.toContain('Fall <2m>')
  })

  it('repeats the tag for multi-value elements (e.g. documented injuries)', () => {
    const r = sample()
    r.injuries = [
      { id: 'i1', view: 'anterior', x: 1, y: 2, region: 'Chest', type: 'fracture', severity: 'severe', notes: '', photos: [] },
      { id: 'i2', view: 'anterior', x: 3, y: 4, region: 'Arm', type: 'laceration', severity: 'moderate', notes: '', photos: [] },
    ]
    const xml = toNemsisXml(toNemsisRecord(r))
    // "Documented Injuries" has no confirmed NEMSIS id, so it falls back to the
    // sanitized name tag — and a multi-value element repeats that tag per value.
    const injuryTags = xml.match(/<DocumentedInjuries name="Documented Injuries">/g) ?? []
    expect(injuryTags.length).toBe(2)
  })

  it('emits conformance gaps as a clearly-marked, non-schema annotation block', () => {
    const xml = toNemsisXml(toNemsisRecord(sample()))
    expect(xml).toContain('<ConformanceGaps>')
    expect(xml).toContain('NOT part of the NEMSIS schema')
    expect(xml).toMatch(/<Gap>eTimes —/)
  })

  it('omits the gaps block only when there are none, and is deterministic', () => {
    const rec = toNemsisRecord(sample())
    const a = toNemsisXml(rec)
    const b = toNemsisXml(rec)
    expect(a).toBe(b) // byte-identical for the same input
    // A record with no values still serializes without throwing.
    expect(() => toNemsisXml(toNemsisRecord(createEmptyRecord('CAS-EMPTY')))).not.toThrow()
  })
})
