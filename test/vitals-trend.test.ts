import { describe, it, expect } from 'vitest'
import { parseVital } from '../src/components/VitalsTrend'

describe('parseVital — pull the primary number from a free-text vital', () => {
  it('reads plain numeric values', () => {
    expect(parseVital('98')).toBe(98)
    expect(parseVital('14')).toBe(14)
  })
  it('takes systolic from a blood-pressure string', () => {
    expect(parseVital('120/80')).toBe(120)
  })
  it('takes the total from the GCS "12 (E3 V4 M5)" format', () => {
    expect(parseVital('12 (E3 V4 M5)')).toBe(12)
  })
  it('tolerates leading/trailing text and units', () => {
    expect(parseVital('88 bpm')).toBe(88)
    expect(parseVital('  36.5 ')).toBe(36.5)
  })
  it('returns null for empty or non-numeric input', () => {
    expect(parseVital('')).toBeNull()
    expect(parseVital(undefined)).toBeNull()
    expect(parseVital('—')).toBeNull()
    expect(parseVital('n/a')).toBeNull()
  })
})
