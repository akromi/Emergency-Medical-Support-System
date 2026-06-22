import { describe, it, expect } from 'vitest'
import { INJURY_TYPES, injuryColor, injuryLabel, type InjuryTypeKey } from '../src/index'

describe('injury catalog', () => {
  it('exposes a non-empty catalog with unique keys and complete entries', () => {
    expect(INJURY_TYPES.length).toBeGreaterThan(0)
    const keys = INJURY_TYPES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length) // keys are unique
    for (const t of INJURY_TYPES) {
      expect(t.label).toBeTruthy()
      expect(t.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('looks up colour and label by key', () => {
    expect(injuryColor('gsw')).toBe('#D7406B')
    expect(injuryLabel('gsw')).toBe('Gunshot')
    expect(injuryColor('fracture')).toBe('#E2A33B')
    expect(injuryLabel('fracture')).toBe('Fracture')
  })

  it('every catalog entry round-trips through the lookups', () => {
    for (const t of INJURY_TYPES) {
      expect(injuryColor(t.key)).toBe(t.color)
      expect(injuryLabel(t.key)).toBe(t.label)
    }
  })

  it('falls back gracefully for an unknown key', () => {
    const unknown = 'not-a-real-injury' as InjuryTypeKey
    expect(injuryColor(unknown)).toBe('#888888')
    expect(injuryLabel(unknown)).toBe('not-a-real-injury') // echoes the key
  })
})
