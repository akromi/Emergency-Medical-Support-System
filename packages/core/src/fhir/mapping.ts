// Maps a CasualtyRecord onto a FHIR R4 Bundle for hospital handover.
// Patient = tombstone, Encounter = transport episode, Condition = injuries,
// Observation = vitals, Procedure / MedicationAdministration = treatments.
import type {
  CasualtyRecord, Injury, Treatment, VitalSign, Sex,
} from '../domain/types.js'
import { injuryLabel } from '../domain/injuries.js'
import type { FhirBundle, FhirResource } from './types.js'

const SEX_TO_GENDER: Record<Sex, string | undefined> = {
  female: 'female', male: 'male', other: 'other', unknown: 'unknown', '': undefined,
}

// LOINC codes for the vitals we capture.
const VITAL_LOINC: Record<string, { code: string; display: string; unit?: string }> = {
  hr:   { code: '8867-4',  display: 'Heart rate', unit: '/min' },
  rr:   { code: '9279-1',  display: 'Respiratory rate', unit: '/min' },
  spo2: { code: '59408-5', display: 'Oxygen saturation', unit: '%' },
  bp:   { code: '85354-9', display: 'Blood pressure panel', unit: 'mmHg' },
  gcs:  { code: '9269-2',  display: 'Glasgow Coma Score' },
  pain: { code: '72514-3', display: 'Pain severity 0-10' },
}

const iso = (ms: number) => new Date(ms).toISOString()

function patient(rec: CasualtyRecord): FhirResource {
  const t = rec.tombstone
  const res: FhirResource = {
    resourceType: 'Patient',
    id: rec.id,
    identifier: [{ system: 'urn:triage-link:case', value: t.mrn || rec.id }],
  }
  if (t.name) res.name = [{ text: t.name }]
  const gender = SEX_TO_GENDER[t.sex]
  if (gender) res.gender = gender
  if (t.dob) res.birthDate = t.dob
  if (t.address) res.address = [{ text: t.address }]
  if (t.nextOfKin) {
    res.contact = [{ name: { text: t.nextOfKin }, telecom: t.nextOfKinPhone ? [{ system: 'phone', value: t.nextOfKinPhone }] : undefined }]
  }
  return res
}

function encounter(rec: CasualtyRecord, patientRef: string): FhirResource {
  return {
    resourceType: 'Encounter',
    id: `enc-${rec.id}`,
    status: rec.handover ? 'finished' : 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'EMER', display: 'emergency' },
    subject: { reference: patientRef },
    period: { start: rec.incident.injuryTime || iso(rec.createdAt) },
    reasonCode: rec.incident.mechanism ? [{ text: rec.incident.mechanism }] : undefined,
  }
}

function condition(inj: Injury, patientRef: string, encRef: string): FhirResource {
  return {
    resourceType: 'Condition',
    id: `cond-${inj.id}`,
    category: [{ text: 'injury' }],
    code: { text: injuryLabel(inj.type) },
    bodySite: [{ text: `${inj.region} (${inj.view})` }],
    severity: { text: inj.severity },
    subject: { reference: patientRef },
    encounter: { reference: encRef },
    note: inj.notes ? [{ text: inj.notes }] : undefined,
  }
}

function observations(v: VitalSign, patientRef: string, encRef: string): FhirResource[] {
  const out: FhirResource[] = []
  const fields: Array<[keyof VitalSign, string]> = [
    ['hr', 'hr'], ['rr', 'rr'], ['spo2', 'spo2'], ['bp', 'bp'], ['gcs', 'gcs'], ['pain', 'pain'],
  ]
  for (const [field, key] of fields) {
    const value = v[field]
    if (!value) continue
    const def = VITAL_LOINC[key]
    out.push({
      resourceType: 'Observation',
      id: `obs-${v.id}-${key}`,
      status: 'final',
      category: [{ coding: [{ code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: def.code, display: def.display }], text: def.display },
      subject: { reference: patientRef },
      encounter: { reference: encRef },
      effectiveDateTime: iso(v.takenAt),
      valueString: def.unit ? `${value} ${def.unit}` : String(value),
    })
  }
  return out
}

function treatment(tx: Treatment, patientRef: string, encRef: string): FhirResource {
  const isMed = /medication/i.test(tx.type)
  if (isMed) {
    return {
      resourceType: 'MedicationAdministration',
      id: `med-${tx.id}`,
      status: 'completed',
      medicationCodeableConcept: { text: tx.detail || 'Medication' },
      subject: { reference: patientRef },
      context: { reference: encRef },
      effectiveDateTime: iso(tx.performedAt),
      performer: tx.provider ? [{ actor: { display: tx.provider } }] : undefined,
    }
  }
  return {
    resourceType: 'Procedure',
    id: `proc-${tx.id}`,
    status: 'completed',
    code: { text: tx.type },
    subject: { reference: patientRef },
    encounter: { reference: encRef },
    performedDateTime: iso(tx.performedAt),
    note: tx.detail ? [{ text: `${tx.detail} (${tx.place})` }] : [{ text: tx.place }],
    performer: tx.provider ? [{ actor: { display: tx.provider } }] : undefined,
  }
}

export function toFhirBundle(rec: CasualtyRecord): FhirBundle {
  const patientRef = `Patient/${rec.id}`
  const encRef = `Encounter/enc-${rec.id}`
  const resources: FhirResource[] = [patient(rec), encounter(rec, patientRef)]

  for (const inj of rec.injuries) resources.push(condition(inj, patientRef, encRef))
  for (const v of rec.vitals) resources.push(...observations(v, patientRef, encRef))
  for (const tx of rec.treatments) resources.push(treatment(tx, patientRef, encRef))

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: resources.map((resource) => ({ fullUrl: `urn:uuid:${resource.id}`, resource })),
  }
}
