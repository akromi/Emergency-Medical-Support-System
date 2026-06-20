import type { InjuryTypeKey } from './types'

export interface InjuryTypeDef {
  key: InjuryTypeKey
  label: string
  color: string
}

export const INJURY_TYPES: InjuryTypeDef[] = [
  { key: 'fracture',   label: 'Fracture',   color: '#E2A33B' },
  { key: 'laceration', label: 'Laceration', color: '#E5484D' },
  { key: 'burn',       label: 'Burn',       color: '#F0883E' },
  { key: 'gsw',        label: 'Gunshot',    color: '#D7406B' },
  { key: 'contusion',  label: 'Contusion',  color: '#9A6CF0' },
  { key: 'amputation', label: 'Amputation', color: '#B0202A' },
  { key: 'abrasion',   label: 'Abrasion',   color: '#E4C84A' },
  { key: 'puncture',   label: 'Puncture',   color: '#E26FB0' },
]

const BY_KEY = new Map(INJURY_TYPES.map((t) => [t.key, t]))
export const injuryColor = (k: InjuryTypeKey): string => BY_KEY.get(k)?.color ?? '#888888'
export const injuryLabel = (k: InjuryTypeKey): string => BY_KEY.get(k)?.label ?? k
