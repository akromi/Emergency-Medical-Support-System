import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRetention, setRetention, subscribeRetention, isRetentionOn,
  retentionCutoff, findExpired, RETENTION_PRESETS,
} from '../src/db/retention'

const DAY = 86_400_000
const NOW = 1_700_000_000_000
const rec = (id: string, ageDays: number) => ({ id, createdAt: NOW - ageDays * DAY })

describe('retention presets store', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* ignore */ }
    setRetention(0) // reset module state
  })

  it('is off by default (keeps data indefinitely)', () => {
    expect(getRetention().days).toBe(0)
    expect(isRetentionOn()).toBe(false)
    expect(retentionCutoff(0, NOW)).toBeNull()
  })

  it('persists a window and reflects it in getRetention + localStorage', () => {
    setRetention(90)
    expect(getRetention().days).toBe(90)
    expect(isRetentionOn()).toBe(true)
    expect(JSON.parse(localStorage.getItem('tl.retention')!).days).toBe(90)
  })

  it('coerces invalid/negative windows to off', () => {
    setRetention(-5)
    expect(getRetention().days).toBe(0)
    setRetention(Number.NaN)
    expect(getRetention().days).toBe(0)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = subscribeRetention(cb)
    setRetention(30)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    setRetention(60)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('exposes the preset windows', () => {
    expect(RETENTION_PRESETS).toContain(90)
    expect(RETENTION_PRESETS.every((d) => d > 0)).toBe(true)
  })
})

describe('findExpired — records past the window', () => {
  const records = [rec('FRESH', 1), rec('EDGE-IN', 89), rec('OLD', 120), rec('ANCIENT', 400)]

  it('returns nothing when retention is off', () => {
    expect(findExpired(records, 0, NOW)).toEqual([])
  })

  it('selects only records created longer ago than the window', () => {
    const expired = findExpired(records, 90, NOW).map((r) => r.id)
    expect(expired).toEqual(['OLD', 'ANCIENT'])
  })

  it('is exclusive at the exact cutoff (a record right at the edge is kept)', () => {
    const edge = [{ id: 'AT-CUTOFF', createdAt: NOW - 90 * DAY }]
    expect(findExpired(edge, 90, NOW)).toEqual([]) // not strictly older than cutoff
  })
})
