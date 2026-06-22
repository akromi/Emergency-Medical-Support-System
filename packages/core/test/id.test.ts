import { describe, it, expect } from 'vitest'
import { genCaseId, genLocalId } from '../src/index'

describe('genCaseId', () => {
  it('produces a CAS-prefixed uppercase alphanumeric id', () => {
    for (let i = 0; i < 50; i++) {
      const id = genCaseId()
      expect(id).toMatch(/^CAS-[0-9A-Z]+$/)
      expect(id.length).toBeGreaterThanOrEqual(6)
    }
  })
})

describe('genLocalId', () => {
  it('honours the given prefix', () => {
    expect(genLocalId('inj-')).toMatch(/^inj-[0-9a-z]+$/)
    expect(genLocalId('v-')).toMatch(/^v-/)
    expect(genLocalId()).toMatch(/^[0-9a-z]+$/) // default: no prefix
  })

  it('is effectively unique across many calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(genLocalId('t-'))
    expect(ids.size).toBe(1000)
  })
})
