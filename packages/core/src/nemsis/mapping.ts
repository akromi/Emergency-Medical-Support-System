// Map a CasualtyRecord onto a NEMSIS v3.5-shaped, section-organized export.
// See ./types.ts for the conformance caveat: element ids/codes are our best
// mapping and must be validated against the official NEMSIS v3.5.0 XSD and the
// Ontario OADS v4.0 spec before certification.
import type {
  CasualtyRecord, Injury, Treatment, VitalSign, Sex, TriageCategory,
  Response, ResponseMode, CrewMember, Scene, SceneLocationType,
} from '../domain/types.js'
import { emptyResponse, emptyScene } from '../domain/types.js'
import { injuryLabel } from '../domain/injuries.js'
import type { NemsisElement, NemsisRecord, NemsisSection } from './types.js'

const NEMSIS_VERSION = '3.5.0'

// ---- value-set mappings (to verify against the official code lists) ----
const SEX_TO_NEMSIS: Record<Sex, string | undefined> = {
  female: '9906001', // Female
  male: '9906003', // Male
  other: '9906007', // Other (placeholder — confirm v3.5 code)
  unknown: '9906009', // Unknown
  '': undefined,
}

// eResponse.23 "Response Mode to Scene". Codes are placeholders pending the
// official value set.
const MODE_TO_NEMSIS: Record<ResponseMode, string | undefined> = {
  emergent: '2207001', // Emergent (Immediate Response)
  'non-emergent': '2207009', // Non-Emergent
  '': undefined,
}

/** The eTimes elements a complete field-care chain needs. Used to decide when
 *  the eTimes conformance gap is satisfied. PSAP/en-route are not field-required
 *  (a field crew may not know the PSAP time), so they are not gating. */
const TIMES_REQUIRED: Array<keyof Response> = ['dispatch', 'atScene', 'atPatient', 'transport', 'atDestination']

// eScene.09 "Incident Location Type". Codes are placeholders pending the official
// value set; the text is carried so the export stays legible.
const LOCATION_TO_NEMSIS: Record<SceneLocationType, { code: string; text: string } | undefined> = {
  home: { code: '1201001', text: 'Home / Residence' },
  street: { code: '1201005', text: 'Street / Highway' },
  public: { code: '1201013', text: 'Public Building' },
  workplace: { code: '1201009', text: 'Industrial / Workplace' },
  healthcare: { code: '1201003', text: 'Healthcare Facility' },
  recreation: { code: '1201011', text: 'Recreation / Sport' },
  other: { code: '1201019', text: 'Other' },
  '': undefined,
}

// NEMSIS eDisposition uses a Patient Evaluation/Care priority; field triage maps
// to the START/SALT-style acuity our four categories express. Codes are
// placeholders pending the OADS/NEMSIS value set.
const TRIAGE_TO_DISPOSITION: Record<TriageCategory, { code: string; text: string }> = {
  immediate: { code: 'IMMEDIATE', text: 'Immediate (Red)' },
  delayed: { code: 'DELAYED', text: 'Delayed (Yellow)' },
  minor: { code: 'MINOR', text: 'Minor (Green)' },
  deceased: { code: 'DECEASED', text: 'Deceased (Black)' },
}

const el = (name: string, value: string | string[] | undefined | null, id?: string): NemsisElement | null =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0) ? null : { id, name, value }

const section = (name: string, elements: Array<NemsisElement | null>): NemsisSection => ({
  section: name,
  elements: elements.filter((e): e is NemsisElement => e !== null),
})

/** Split "Surname, Given" into [last, first]; a name with no comma is all last. */
function splitName(name: string): { last: string; first: string } {
  const i = name.indexOf(',')
  if (i < 0) return { last: name.trim(), first: '' }
  return { last: name.slice(0, i).trim(), first: name.slice(i + 1).trim() }
}

/** Split "120/80" into systolic / diastolic. */
function splitBp(bp: string): { sbp: string; dbp: string } {
  const [s, d] = bp.split('/')
  return { sbp: (s ?? '').trim(), dbp: (d ?? '').trim() }
}

function ePatient(rec: CasualtyRecord): NemsisSection {
  const t = rec.tombstone
  const { last, first } = splitName(t.name)
  return section('ePatient', [
    el('Patient Last Name', last, 'ePatient.02'),
    el('Patient First Name', first, 'ePatient.03'),
    el('Patient Date of Birth', t.dob, 'ePatient.05'),
    el('Patient Gender', SEX_TO_NEMSIS[t.sex], 'ePatient.13'),
    el('Patient Home Address', t.address), // address sub-elements (ePatient.07–12) — to map per XSD
    el('Local Patient/Encounter ID (MRN)', t.mrn, 'ePatient.18'),
  ])
}

function eVitalsFor(v: VitalSign): NemsisSection {
  const bp = v.bp ? splitBp(v.bp) : { sbp: '', dbp: '' }
  return section('eVitals', [
    el('Vitals Date/Time', new Date(v.takenAt).toISOString(), 'eVitals.01'),
    el('SBP (Systolic Blood Pressure)', bp.sbp, 'eVitals.06'),
    el('DBP (Diastolic Blood Pressure)', bp.dbp, 'eVitals.07'),
    el('Heart Rate', v.hr ?? '', 'eVitals.10'),
    el('Pulse Oximetry (SpO2)', v.spo2 ?? '', 'eVitals.12'),
    el('Respiratory Rate', v.rr ?? '', 'eVitals.14'),
    el('Total Glasgow Coma Score', v.gcs ?? '', 'eVitals.19'),
    el('Pain Scale Score', v.pain ?? '', 'eVitals.27'),
  ])
}

function eInjury(injuries: Injury[], mechanism: string): NemsisSection {
  return section('eInjury', [
    el('Cause of Injury (Mechanism)', mechanism, 'eInjury.01'),
    el('Documented Injuries', injuries.map((i) => `${injuryLabel(i.type)} — ${i.region} (${i.severity})`)),
  ])
}

function eProceduresAndMeds(treatments: Treatment[]): NemsisSection[] {
  const meds = treatments.filter((t) => t.type === 'Medication')
  const procs = treatments.filter((t) => t.type !== 'Medication')
  const out: NemsisSection[] = []
  if (procs.length) {
    out.push(section('eProcedures', [
      el('Procedures Performed', procs.map((p) => `${p.type}${p.detail ? ` — ${p.detail}` : ''} @ ${p.place}`), 'eProcedures.03'),
    ]))
  }
  if (meds.length) {
    out.push(section('eMedications', [
      el('Medications Given', meds.map((m) => `${m.detail || 'Medication'} @ ${m.place}`), 'eMedications.03'),
    ]))
  }
  return out
}

function eResponse(r: Response): NemsisSection {
  return section('eResponse', [
    el('EMS Agency Number', r.agency, 'eResponse.01'),
    el('EMS Unit / Vehicle Number', r.unit, 'eResponse.07'),
    el('Response Mode to Scene', MODE_TO_NEMSIS[r.mode], 'eResponse.23'),
  ])
}

// Timestamps are stored as `datetime-local` strings; emit them verbatim (as the
// raw local-time string), matching eSituation's Incident Date/Time, rather than
// coercing through Date — `new Date('YYYY-MM-DDTHH:mm')` parses as local time, so
// toISOString() would be timezone-dependent and non-deterministic.
function eTimes(r: Response): NemsisSection {
  return section('eTimes', [
    el('PSAP Call Date/Time', r.psap, 'eTimes.01'),
    el('Unit Notified by Dispatch Date/Time', r.dispatch, 'eTimes.03'),
    el('Unit En Route Date/Time', r.enRoute, 'eTimes.05'),
    el('Unit Arrived on Scene Date/Time', r.atScene, 'eTimes.06'),
    el('Arrived at Patient Date/Time', r.atPatient, 'eTimes.07'),
    el('Unit Left Scene Date/Time', r.transport, 'eTimes.09'),
    el('Patient Arrived at Destination Date/Time', r.atDestination, 'eTimes.11'),
  ])
}

function eCrew(crew: CrewMember[]): NemsisSection {
  return section('eCrew', [
    el('Crew Members', crew.map((c) => {
      const quals = [c.role, c.cert].filter(Boolean).join(', ')
      return quals ? `${c.name} (${quals})` : c.name
    }), 'eCrew.01'),
  ])
}

function eScene(s: Scene): NemsisSection {
  const loc = LOCATION_TO_NEMSIS[s.locationType]
  return section('eScene', [
    el('Incident GPS / Location', s.gps, 'eScene.13'),
    el('Incident Location Type', loc?.text, 'eScene.09'),
    el('Mass Casualty Incident', s.massCasualty ? 'Yes' : undefined, 'eScene.01'),
  ])
}

function eDisposition(rec: CasualtyRecord): NemsisSection {
  const triage = rec.incident.triage
  const ho = rec.handover
  return section('eDisposition', [
    triage ? el('Triage Classification (field)', TRIAGE_TO_DISPOSITION[triage].text) : null,
    el('Receiving Facility', ho?.facility ?? '', 'eDisposition.01'),
    el('Receiving Clinician', ho?.clinician ?? ''),
    el('Transfer-of-Care Date/Time', ho ? new Date(ho.at).toISOString() : '', 'eDisposition.24'),
  ])
}

/** Elements OADS/NEMSIS require for a complete record that TRIAGE-LINK does not
 *  capture today — kept explicit so the conformance gap is visible. */
function conformanceGaps(rec: CasualtyRecord): string[] {
  const gaps: string[] = []
  const r = rec.response ?? emptyResponse()
  // eTimes: report until the field-care chain is complete. An incident time
  // alone never satisfied this — now the dedicated chain does, when filled.
  if (TIMES_REQUIRED.some((k) => !r[k])) {
    gaps.push('eTimes — full PSAP/dispatch/at-scene/at-patient/transport/at-destination timestamp chain')
  }
  // eResponse: agency + unit are the minimum to identify the responder.
  if (!r.agency || !r.unit) {
    gaps.push('eResponse — agency/unit/vehicle identifiers')
  }
  // eCrew: at least one crew member documents who provided care.
  if ((rec.crew ?? []).length === 0) {
    gaps.push('eCrew — crew member ids, roles, certification levels')
  }
  // eScene: GPS + location type are the minimum to place the incident.
  const scene = rec.scene ?? emptyScene()
  if (!scene.gps || !scene.locationType) {
    gaps.push('eScene — scene GPS, incident location type/coding')
  }
  gaps.push('ePayment / eOutcome — billing + linked hospital outcome')
  return gaps
}

/**
 * Build a NEMSIS v3.5-shaped export for one casualty record. Section-organized,
 * with explicit conformance gaps. NOT a certified export — validate element
 * ids/codes against the official XSD/OADS spec first (see ./types.ts).
 */
export function toNemsisRecord(rec: CasualtyRecord): NemsisRecord {
  const response = rec.response ?? emptyResponse()
  const sections: NemsisSection[] = [
    section('eRecord', [el('Patient Care Report Number', rec.id, 'eRecord.01')]),
    ePatient(rec),
    eResponse(response),
    eCrew(rec.crew ?? []),
    eTimes(response),
    eScene(rec.scene ?? emptyScene()),
    section('eSituation', [
      el('Incident Date/Time', rec.incident.injuryTime, 'eSituation.01'),
      el('Incident Location', rec.incident.location),
    ]),
    eInjury(rec.injuries, rec.incident.mechanism),
    ...rec.vitals.map(eVitalsFor),
    ...eProceduresAndMeds(rec.treatments),
    eDisposition(rec),
  ].filter((s) => s.elements.length > 0)

  return {
    patientCareReportNumber: rec.id,
    standard: 'NEMSIS',
    version: NEMSIS_VERSION,
    sections,
    gaps: conformanceGaps(rec),
  }
}
