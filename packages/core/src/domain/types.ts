// ---- Domain model: a single casualty record ----
// Framework-free. This module is the shared source of truth for the system.

export type TriageCategory = 'immediate' | 'delayed' | 'minor' | 'deceased'
/** Lund–Browder age bands — drive age-adjusted burn TBSA. */
export type AgeBand = 'infant' | 'age1' | 'age5' | 'age10' | 'age15' | 'adult'
export type BodyView = 'anterior' | 'posterior'
export type InjurySeverity = 'minor' | 'moderate' | 'severe' | 'critical'
export type Sex = '' | 'female' | 'male' | 'other' | 'unknown'

export type InjuryTypeKey =
  | 'fracture' | 'laceration' | 'burn' | 'gsw'
  | 'contusion' | 'amputation' | 'abrasion' | 'puncture'

export type TreatmentPlace = 'scene' | 'enroute' | 'handover'

/** Patient identity ("tombstone") — the stable identity layer. */
export interface Tombstone {
  name: string
  dob: string
  sex: Sex
  mrn: string
  bloodType: string
  address: string
  nextOfKin: string
  nextOfKinPhone: string
}

export interface Incident {
  injuryTime: string
  mechanism: string
  location: string
  triage: TriageCategory | ''
  /** Patient age band for Lund–Browder TBSA (defaults to adult). */
  ageBand: AgeBand
}

export interface Injury {
  id: string
  view: BodyView
  x: number
  y: number
  region: string
  type: InjuryTypeKey
  severity: InjurySeverity
  notes: string
  /** Attached photos as (downscaled) image data URLs. */
  photos: string[]
}

export interface VitalSign {
  id: string
  takenAt: number
  hr?: string
  bp?: string
  rr?: string
  spo2?: string
  gcs?: string
  pain?: string
}

export interface Treatment {
  id: string
  performedAt: number
  type: string
  detail: string
  place: TreatmentPlace
  provider: string
}

export interface Handover {
  at: number
  clinician: string
  facility: string
}

export type ResponseMode = '' | 'emergent' | 'non-emergent'

/** EMS response context + the OADS/NEMSIS time chain (NEMSIS eResponse + eTimes).
 *  All fields blank by default — purely additive: an all-blank Response leaves
 *  existing behaviour, exports, and the op-log unchanged. Timestamps are stored
 *  as `datetime-local` strings, the same shape as `incident.injuryTime`. */
export interface Response {
  /** eResponse — agency / service name or number. */
  agency: string
  /** eResponse — responding unit / vehicle id. */
  unit: string
  /** eResponse — emergent (lights & sirens) vs non-emergent response. */
  mode: ResponseMode
  // eTimes chain, in order:
  psap: string // PSAP / 9-1-1 call received
  dispatch: string // unit notified by dispatch
  enRoute: string // unit en route
  atScene: string // unit arrived on scene
  atPatient: string // arrived at patient
  transport: string // left scene / en route to destination
  atDestination: string // arrived at destination
}

/** NEMSIS eCrew member — who provided care. Seeded from the operator roster but
 *  stored per-record so it survives the roster changing. Free-text role/cert
 *  pending the NEMSIS crew-role / certification-level value sets. */
export interface CrewMember {
  id: string
  name: string
  role: string // e.g. lead, attendant, driver
  cert: string // certification level, e.g. PCP / ACP
}

/** NEMSIS eScene location-type value set (codes TBD against the OADS/NEMSIS
 *  dictionary; the keys here are our stable internal identifiers). */
export type SceneLocationType =
  | '' | 'home' | 'street' | 'public' | 'workplace' | 'healthcare' | 'recreation' | 'other'

/** NEMSIS eScene — where the incident happened. Blank by default (additive). */
export interface Scene {
  gps: string // "lat, long" or a grid reference
  locationType: SceneLocationType
  massCasualty: boolean // mass-casualty incident flag
}

/** Who created the record — a snapshot of the operator (see db/operators.ts),
 *  captured at creation so it survives the operator later being renamed/removed.
 *  Optional: single-operator / community use leaves it undefined. */
export interface RecordAuthor {
  id: string
  name: string
}

export interface CasualtyRecord {
  id: string
  tombstone: Tombstone
  incident: Incident
  injuries: Injury[]
  vitals: VitalSign[]
  treatments: Treatment[]
  handover: Handover | null
  /** EMS response context + time chain (eResponse/eTimes). Blank by default. */
  response: Response
  /** Care crew (eCrew). Empty by default. */
  crew: CrewMember[]
  /** Scene location (eScene). Blank by default. */
  scene: Scene
  author?: RecordAuthor
  createdAt: number
  updatedAt: number
}

/** A blank Response (all fields empty). */
export function emptyResponse(): Response {
  return {
    agency: '', unit: '', mode: '',
    psap: '', dispatch: '', enRoute: '', atScene: '',
    atPatient: '', transport: '', atDestination: '',
  }
}

/** A blank Scene. */
export function emptyScene(): Scene {
  return { gps: '', locationType: '', massCasualty: false }
}

export function createEmptyRecord(id: string): CasualtyRecord {
  const now = Date.now()
  return {
    id,
    tombstone: {
      name: '', dob: '', sex: '', mrn: id, bloodType: '',
      address: '', nextOfKin: '', nextOfKinPhone: '',
    },
    incident: { injuryTime: '', mechanism: '', location: '', triage: '', ageBand: 'adult' },
    injuries: [],
    vitals: [],
    treatments: [],
    handover: null,
    response: emptyResponse(),
    crew: [],
    scene: emptyScene(),
    createdAt: now,
    updatedAt: now,
  }
}

/** Fill in record groups added after a record was first stored (e.g. `response`,
 *  `crew`, `scene`), so records persisted by an older build load without
 *  crashing. Purely additive and idempotent — groups already present are kept. */
export function normalizeRecord(rec: CasualtyRecord): CasualtyRecord {
  if (rec.response && rec.crew && rec.scene) return rec
  return {
    ...rec,
    response: rec.response ?? emptyResponse(),
    crew: rec.crew ?? [],
    scene: rec.scene ?? emptyScene(),
  }
}

export const TRIAGE_LABELS: Record<TriageCategory, string> = {
  immediate: 'Immediate (Red)',
  delayed: 'Delayed (Yellow)',
  minor: 'Minor (Green)',
  deceased: 'Deceased (Black)',
}

export const TRIAGE_COLORS: Record<TriageCategory, string> = {
  immediate: '#E5484D',
  delayed: '#E2A33B',
  minor: '#48B25C',
  deceased: '#7C8794',
}

/** Age bands in display order, with short labels for the selector. */
export const AGE_BAND_ORDER: AgeBand[] = ['infant', 'age1', 'age5', 'age10', 'age15', 'adult']
export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  infant: '<1y',
  age1: '1y',
  age5: '5y',
  age10: '10y',
  age15: '15y',
  adult: 'Adult',
}
