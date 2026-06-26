import { describe, it, expect } from 'vitest'
import { elapsedSince, formatElapsed } from '../src/index'

// Injury recorded at 2026-06-24 10:00 local; reference instants are offsets of it.
const INJURY = '2026-06-24T10:00'
const base = new Date(INJURY).getTime()
const min = 60_000
const hour = 60 * min
const day = 24 * hour

describe('elapsedSince', () => {
  it('returns the elapsed milliseconds for a past injury time', () => {
    expect(elapsedSince(INJURY, base + 45 * min)).toBe(45 * min)
    expect(elapsedSince(INJURY, base + 3 * hour)).toBe(3 * hour)
  })

  it('treats the exact instant as zero elapsed', () => {
    expect(elapsedSince(INJURY, base)).toBe(0)
  })

  it('returns null for empty, unparseable, or future times', () => {
    expect(elapsedSince('', base)).toBeNull()
    expect(elapsedSince('not-a-date', base)).toBeNull()
    expect(elapsedSince(INJURY, base - min)).toBeNull() // injury in the future
  })
})

describe('formatElapsed', () => {
  it('formats minutes, hours+minutes, and days+hours compactly', () => {
    expect(formatElapsed(45 * min)).toBe('45m')
    expect(formatElapsed(hour + 24 * min)).toBe('1h 24m')
    expect(formatElapsed(2 * day + 3 * hour + 30 * min)).toBe('2d 3h') // minutes dropped at day scale
  })

  it('reads 0m under a minute', () => {
    expect(formatElapsed(0)).toBe('0m')
    expect(formatElapsed(59_000)).toBe('0m')
  })

  it('honours overridden (localised) unit suffixes', () => {
    expect(formatElapsed(hour + 24 * min, { d: 'j', h: 'h', m: 'min' })).toBe('1h 24min')
    expect(formatElapsed(2 * day + 3 * hour, { d: 'j', h: 'h', m: 'min' })).toBe('2j 3h')
  })
})
