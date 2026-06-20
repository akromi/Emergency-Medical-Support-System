// ---- Domain model: a single casualty record ----
// Framework-free. This module is the shared source of truth for the system.

export type TriageCategory = 'immediate' | 'delayed' | 'minor' | 'deceased'
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

export interface CasualtyRecord {
  id: string
  tombstone: Tombstone
  incident: Incident
  injuries: Injury[]
  vitals: VitalSign[]
  treatments: Treatment[]
  handover: Handover | null
  createdAt: number
  updatedAt: number
}

export function createEmptyRecord(id: string): CasualtyRecord {
  const now = Date.now()
  return {
    id,
    tombstone: {
      name: '', dob: '', sex: '', mrn: id, bloodType: '',
      address: '', nextOfKin: '', nextOfKinPhone: '',
    },
    incident: { injuryTime: '', mechanism: '', location: '', triage: '' },
    injuries: [],
    vitals: [],
    treatments: [],
    handover: null,
    createdAt: now,
    updatedAt: now,
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
