import { describe, it, expect } from 'vitest'
import { toNemsisRecord } from '../src/nemsis/mapping.js'
import { validateNemsisRecord, validationErrors, type ConformanceRuleset } from '../src/nemsis/validation.js'
import { PLACEHOLDER_RULESET } from '../src/nemsis/ruleset-placeholder.js'
import type { NemsisRecord } from '../src/nemsis/types.js'
import { createEmptyRecord, type CasualtyRecord } from '../src/domain/types.js'

function fullRecord(): CasualtyRecord {
  const r = createEmptyRecord('CAS-1')
  r.tombstone = { ...r.tombstone, name: 'Doe, Jane', dob: '1990-05-01', sex: 'female', mrn: 'MRN-9' }
  r.incident = { ...r.incident, injuryTime: '2026-06-28T10:00', mechanism: 'Fall', location: '123 Main St', triage: 'immediate' }
  r.response = {
    ...r.response, agency: 'TPS', unit: 'M-12', mode: 'emergent',
    dispatch: '2026-06-28T09:50', atScene: '2026-06-28T09:58', atPatient: '2026-06-28T10:00',
    transport: '2026-06-28T10:20', atDestination: '2026-06-28T10:35',
  }
  r.handover = { at: 1_700_000_100_000, clinician: 'Dr. Roe', facility: 'General Hospital' }
  return r
}

describe('validateNemsisRecord', () => {
  it('passes a complete record against the placeholder ruleset (no errors)', () => {
    const result = validateNemsisRecord(toNemsisRecord(fullRecord()), PLACEHOLDER_RULESET)
    expect(validationErrors(result)).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('always reports the ruleset provenance so a placeholder pass is never mistaken for certification', () => {
    const result = validateNemsisRecord(toNemsisRecord(fullRecord()), PLACEHOLDER_RULESET)
    expect(result.rulesetSource).toBe('placeholder')
  })

  it('flags a missing required element as an error', () => {
    // A required rule the record cannot satisfy (no such element is emitted).
    const ruleset: ConformanceRuleset = {
      standard: 'NEMSIS', version: '3.5.0', source: 'placeholder',
      elements: [{ id: 'eNeverEmitted.99', cardinality: 'required', datatype: 'string' }],
    }
    const result = validateNemsisRecord(toNemsisRecord(fullRecord()), ruleset)
    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'missing-required', elementId: 'eNeverEmitted.99', severity: 'error' }),
    )
  })

  it('rejects a value outside its value set', () => {
    const ruleset: ConformanceRuleset = {
      standard: 'NEMSIS', version: '3.5.0', source: 'placeholder',
      elements: [{ id: 'ePatient.13', cardinality: 'optional', datatype: 'code', valueSet: ['0000000'] }],
    }
    const result = validateNemsisRecord(toNemsisRecord(fullRecord()), ruleset)
    expect(result.valid).toBe(false)
    expect(validationErrors(result).some((i) => i.code === 'unknown-code' && i.elementId === 'ePatient.13')).toBe(true)
  })

  it('rejects a malformed datatype', () => {
    const bad: NemsisRecord = {
      patientCareReportNumber: 'CAS-1', standard: 'NEMSIS', version: '3.5.0', gaps: [],
      sections: [{ section: 'eTimes', elements: [{ id: 'eTimes.06', name: 'Unit Arrived on Scene Date/Time', value: 'not-a-date' }] }],
    }
    const result = validateNemsisRecord(bad, PLACEHOLDER_RULESET)
    expect(validationErrors(result).some((i) => i.code === 'bad-datatype' && i.elementId === 'eTimes.06')).toBe(true)
  })

  it('warns (not errors) when a recommended element is absent', () => {
    // An empty record has no handover, so eDisposition.01 (recommended) is absent.
    const result = validateNemsisRecord(toNemsisRecord(createEmptyRecord('CAS-EMPTY')), PLACEHOLDER_RULESET)
    expect(result.valid).toBe(true) // recommended-absence is a warning, not an error
    expect(result.issues.some((i) => i.code === 'missing-recommended' && i.elementId === 'eDisposition.01')).toBe(true)
  })

  it('strict mode warns about record elements with no rule', () => {
    const result = validateNemsisRecord(toNemsisRecord(fullRecord()), PLACEHOLDER_RULESET, { strict: true })
    expect(result.valid).toBe(true) // unmapped elements are warnings only
    expect(result.issues.some((i) => i.code === 'unmapped-element')).toBe(true)
  })
})
