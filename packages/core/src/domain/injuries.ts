import type { InjuryTypeKey } from './types.js'

export interface InjuryTypeDef {
  key: InjuryTypeKey
  label: string
  color: string
}

// Colours are categorical TYPE identifiers, not triage/severity levels. They
// span the full hue wheel (incl. cool colours) and deliberately avoid reading
// as START triage red/yellow/green so a marker's colour can't be mistaken for
// an acuity level. Every type is a distinct hue.
export const INJURY_TYPES: InjuryTypeDef[] = [
  { key: 'fracture',   label: 'Fracture',   color: '#E0A52E' }, // amber
  { key: 'laceration', label: 'Laceration', color: '#E5484D' }, // red
  { key: 'burn',       label: 'Burn',       color: '#F2670A' }, // orange
  { key: 'gsw',        label: 'Gunshot',    color: '#3E9BFF' }, // blue
  { key: 'contusion',  label: 'Contusion',  color: '#9A6CF0' }, // purple
  { key: 'amputation', label: 'Amputation', color: '#19B58C' }, // teal
  { key: 'abrasion',   label: 'Abrasion',   color: '#D2D63E' }, // yellow
  { key: 'puncture',   label: 'Puncture',   color: '#EC6AAD' }, // pink
]

const BY_KEY = new Map(INJURY_TYPES.map((t) => [t.key, t]))
export const injuryColor = (k: InjuryTypeKey): string => BY_KEY.get(k)?.color ?? '#888888'
export const injuryLabel = (k: InjuryTypeKey): string => BY_KEY.get(k)?.label ?? k
