import { describe, it, expect } from 'vitest'
import {
  createEmptyRecord, TRIAGE_LABELS, TRIAGE_COLORS, type TriageCategory,
} from '../src/index'

describe('createEmptyRecord', () => {
  const id = 'CAS-ABC123'
  const rec = createEmptyRecord(id)

  it('carries the id through and seeds the MRN from it', () => {
    expect(rec.id).toBe(id)
    expect(rec.tombstone.mrn).toBe(id)
  })

  it('starts with empty identity, incident, and collections', () => {
    expect(rec.tombstone.name).toBe('')
    expect(rec.tombstone.sex).toBe('')
    expect(rec.incident.triage).toBe('')
    expect(rec.injuries).toEqual([])
    expect(rec.vitals).toEqual([])
    expect(rec.treatments).toEqual([])
    expect(rec.handover).toBeNull()
  })

  it('timestamps the record at creation', () => {
    expect(typeof rec.createdAt).toBe('number')
    expect(rec.updatedAt).toBe(rec.createdAt)
  })
})

describe('triage tables', () => {
  const categories: TriageCategory[] = ['immediate', 'delayed', 'minor', 'deceased']

  it('define a label and a hex colour for every category', () => {
    for (const c of categories) {
      expect(TRIAGE_LABELS[c]).toBeTruthy()
      expect(TRIAGE_COLORS[c]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
