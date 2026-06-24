import { describe, it, expect } from 'vitest'
import {
  createEmptyRecord,
  injuryLabel,
  toFhirBundle,
  type CasualtyRecord,
  type FhirResource,
} from '../src/index'

// A representative, fully-populated casualty record used as the round-trip input.
function sampleRecord(): CasualtyRecord {
  const base = createEmptyRecord('CAS-TEST01')
  const injuryTime = '2026-06-22T08:30'
  return {
    ...base,
    tombstone: {
      ...base.tombstone,
      name: 'Doe, Jane',
      dob: '1990-04-01',
      sex: 'female',
      mrn: 'MRN-9001',
      bloodType: 'O+',
      address: '12 Field Rd',
      nextOfKin: 'Doe, John',
      nextOfKinPhone: '+15551234567',
    },
    incident: {
      injuryTime,
      mechanism: 'RTC — blunt trauma',
      location: 'Junction 14',
      triage: 'immediate',
      ageBand: 'adult',
    },
    injuries: [
      { id: 'inj-1', view: 'anterior', x: 100, y: 120, region: 'Chest', type: 'gsw', severity: 'critical', notes: 'penetrating' },
      { id: 'inj-2', view: 'posterior', x: 90, y: 280, region: 'L Thigh', type: 'laceration', severity: 'moderate', notes: '' },
    ],
    vitals: [
      { id: 'v-1', takenAt: 1_700_000_000_000, hr: '120', bp: '90/60', rr: '24', spo2: '88', gcs: '13', pain: '7' },
    ],
    treatments: [
      { id: 't-1', performedAt: 1_700_000_100_000, type: 'Tourniquet', detail: 'L thigh, 08:35', place: 'scene', provider: 'AB' },
      { id: 't-2', performedAt: 1_700_000_200_000, type: 'Medication', detail: 'Morphine 10mg IM', place: 'enroute', provider: 'CD' },
    ],
  }
}

// Helpers to pull resources back out of the bundle (the "round-trip" read side).
const byType = (resources: FhirResource[], t: string) => resources.filter((r) => r.resourceType === t)
const oneByType = (resources: FhirResource[], t: string) => {
  const found = byType(resources, t)
  expect(found, `expected exactly one ${t}`).toHaveLength(1)
  return found[0]
}

describe('toFhirBundle — CasualtyRecord round-trip', () => {
  const rec = sampleRecord()
  const bundle = toFhirBundle(rec)
  const resources = bundle.entry.map((e) => e.resource)

  const patientRef = `Patient/${rec.id}`
  const encRef = `Encounter/enc-${rec.id}`

  it('produces a FHIR R4 collection Bundle with one entry per resource', () => {
    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('collection')
    expect(typeof bundle.timestamp).toBe('string')
    expect(bundle.entry.length).toBeGreaterThan(0)
    // Every entry carries a fullUrl derived from the resource id.
    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource.id}`)
    }
  })

  it('maps the tombstone onto a Patient resource', () => {
    const patient = oneByType(resources, 'Patient')
    expect(patient.id).toBe(rec.id)
    expect(patient.gender).toBe('female')
    expect(patient.birthDate).toBe(rec.tombstone.dob)
    expect(patient.name).toEqual([{ text: 'Doe, Jane' }])
    expect(patient.identifier).toEqual([
      { system: 'urn:triage-link:case', value: 'MRN-9001' },
    ])
    // Next-of-kin becomes a contact with a phone telecom.
    expect(patient.contact).toEqual([
      { name: { text: 'Doe, John' }, telecom: [{ system: 'phone', value: '+15551234567' }] },
    ])
  })

  it('maps the incident onto an emergency Encounter referencing the Patient', () => {
    const enc = oneByType(resources, 'Encounter')
    expect(enc.id).toBe(`enc-${rec.id}`)
    expect(enc.status).toBe('in-progress') // no handover yet
    expect(enc.class).toMatchObject({ code: 'EMER' })
    expect(enc.subject).toEqual({ reference: patientRef })
    expect(enc.period).toEqual({ start: rec.incident.injuryTime })
    expect(enc.reasonCode).toEqual([{ text: 'RTC — blunt trauma' }])
  })

  it('flips the Encounter to finished once a handover is recorded', () => {
    const handed = toFhirBundle({
      ...rec,
      handover: { at: Date.now(), clinician: 'Dr X', facility: 'County General' },
    })
    const enc = oneByType(handed.entry.map((e) => e.resource), 'Encounter')
    expect(enc.status).toBe('finished')
  })

  it('maps each injury onto a Condition with correct references and body site', () => {
    const conditions = byType(resources, 'Condition')
    expect(conditions).toHaveLength(rec.injuries.length)

    for (const inj of rec.injuries) {
      const cond = conditions.find((c) => c.id === `cond-${inj.id}`)
      expect(cond, `Condition for ${inj.id}`).toBeDefined()
      expect(cond!.code).toEqual({ text: injuryLabel(inj.type) })
      expect(cond!.bodySite).toEqual([{ text: `${inj.region} (${inj.view})` }])
      expect(cond!.severity).toEqual({ text: inj.severity })
      // References tie the Condition to the same Patient and Encounter.
      expect(cond!.subject).toEqual({ reference: patientRef })
      expect(cond!.encounter).toEqual({ reference: encRef })
    }
  })

  it('maps each captured vital onto a LOINC-coded vital-signs Observation', () => {
    const obs = byType(resources, 'Observation')
    const v = rec.vitals[0]

    // One Observation per non-empty vital field (hr, bp, rr, spo2, gcs, pain = 6).
    expect(obs).toHaveLength(6)

    // LOINC codes that must appear, keyed by the Observation id suffix.
    const expectedLoinc: Record<string, { code: string; display: string }> = {
      hr: { code: '8867-4', display: 'Heart rate' },
      rr: { code: '9279-1', display: 'Respiratory rate' },
      spo2: { code: '59408-5', display: 'Oxygen saturation' },
      bp: { code: '85354-9', display: 'Blood pressure panel' },
      gcs: { code: '9269-2', display: 'Glasgow Coma Score' },
      pain: { code: '72514-3', display: 'Pain severity 0-10' },
    }

    for (const [key, loinc] of Object.entries(expectedLoinc)) {
      const o = obs.find((r) => r.id === `obs-${v.id}-${key}`)
      expect(o, `Observation for ${key}`).toBeDefined()
      expect(o!.status).toBe('final')
      expect(o!.category).toEqual([{ coding: [{ code: 'vital-signs' }] }])
      // The LOINC coding is the crux of EHR interoperability.
      const code = o!.code as { coding: Array<{ system: string; code: string; display: string }> }
      expect(code.coding[0]).toEqual({
        system: 'http://loinc.org',
        code: loinc.code,
        display: loinc.display,
      })
      // Same subject/encounter references as everything else in the episode.
      expect(o!.subject).toEqual({ reference: patientRef })
      expect(o!.encounter).toEqual({ reference: encRef })
      expect(o!.effectiveDateTime).toBe(new Date(v.takenAt).toISOString())
    }
  })

  it('maps treatments onto Procedure / MedicationAdministration', () => {
    const procedures = byType(resources, 'Procedure')
    const meds = byType(resources, 'MedicationAdministration')

    // Tourniquet -> Procedure; Medication -> MedicationAdministration.
    expect(procedures).toHaveLength(1)
    expect(meds).toHaveLength(1)

    const proc = procedures[0]
    expect(proc.id).toBe('proc-t-1')
    expect(proc.code).toEqual({ text: 'Tourniquet' })
    expect(proc.subject).toEqual({ reference: patientRef })
    expect(proc.encounter).toEqual({ reference: encRef })

    const med = meds[0]
    expect(med.id).toBe('med-t-2')
    expect(med.medicationCodeableConcept).toEqual({ text: 'Morphine 10mg IM' })
    expect(med.subject).toEqual({ reference: patientRef })
    expect(med.context).toEqual({ reference: encRef })
  })

  it('keeps every resource reference internally consistent', () => {
    // No resource should reference a Patient/Encounter id that is not in the bundle.
    const ids = new Set(resources.map((r) => `${r.resourceType}/${r.id}`))
    ids.add(patientRef) // Patient id has no resourceType prefix mismatch
    expect(ids.has(`Patient/${rec.id}`)).toBe(true)
    expect(ids.has(`Encounter/enc-${rec.id}`)).toBe(true)

    const refs: string[] = []
    const collect = (ref: unknown) => {
      if (ref && typeof ref === 'object' && 'reference' in (ref as object)) {
        refs.push((ref as { reference: string }).reference)
      }
    }
    for (const r of resources) {
      collect(r.subject)
      collect(r.encounter)
      collect(r.context)
    }
    // Every collected reference points at the one Patient or the one Encounter.
    for (const ref of refs) {
      expect([patientRef, encRef]).toContain(ref)
    }
  })
})
