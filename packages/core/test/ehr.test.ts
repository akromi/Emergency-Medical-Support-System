import { describe, it, expect } from 'vitest'
import {
  identityFromTombstone,
  buildPatientMatchParameters,
  parsePatientMatchBundle,
  buildAccessAuditEvent,
  ONTARIO_SYSTEMS,
  createEmptyRecord,
  type FhirResource,
} from '../src/index'

describe('identityFromTombstone', () => {
  it('maps health card, dob, gender and splits "Family, Given" name', () => {
    const rec = createEmptyRecord('CAS-1')
    const q = identityFromTombstone({
      ...rec.tombstone,
      name: 'Doe, Jane',
      dob: '1990-04-01',
      sex: 'female',
      mrn: '1234567890',
    })
    expect(q).toEqual({
      healthCardNumber: '1234567890',
      birthDate: '1990-04-01',
      gender: 'female',
      familyName: 'Doe',
      givenName: 'Jane',
    })
  })

  it('omits empty fields and drops the blank sex', () => {
    const rec = createEmptyRecord('CAS-2')
    // Blank everything (createEmptyRecord seeds mrn with the record id).
    expect(identityFromTombstone({ ...rec.tombstone, mrn: '' })).toEqual({})
  })
})

describe('buildPatientMatchParameters', () => {
  it('builds a Parameters with an OHIP-identified Patient resource', () => {
    const params = buildPatientMatchParameters(
      { healthCardNumber: '1234567890', familyName: 'Doe', givenName: 'Jane', birthDate: '1990-04-01', gender: 'female' },
      { onlyCertainMatches: true, count: 5 },
    )
    expect(params.resourceType).toBe('Parameters')
    const parameter = params.parameter as Array<Record<string, unknown>>
    const resourceParam = parameter.find((p) => p.name === 'resource')
    const patient = resourceParam!.resource as FhirResource
    const id = (patient.identifier as Array<Record<string, unknown>>)[0]
    expect(id.system).toBe(ONTARIO_SYSTEMS.healthCard)
    expect(id.value).toBe('1234567890')
    expect((patient.name as Array<Record<string, unknown>>)[0]).toMatchObject({ family: 'Doe', given: ['Jane'] })
    expect(parameter.find((p) => p.name === 'onlyCertainMatches')).toMatchObject({ valueBoolean: true })
    expect(parameter.find((p) => p.name === 'count')).toMatchObject({ valueInteger: 5 })
  })
})

describe('parsePatientMatchBundle', () => {
  const bundle = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'pcr-1',
          identifier: [{ system: ONTARIO_SYSTEMS.healthCard, value: '1234567890' }],
          name: [{ family: 'Doe', given: ['Jane'] }],
          birthDate: '1990-04-01',
          gender: 'female',
        },
        search: { mode: 'match', score: 0.99 },
      },
      {
        resource: { resourceType: 'Patient', id: 'pcr-2', name: [{ family: 'Doe' }] },
        search: { mode: 'match', score: 0.5 },
      },
      // Non-patient entries (e.g. OperationOutcome) must be ignored.
      { resource: { resourceType: 'OperationOutcome' } },
    ],
  }

  it('extracts candidates sorted by score and flags a single certain match', () => {
    const result = parsePatientMatchBundle(bundle)
    expect(result.matches).toHaveLength(2)
    expect(result.matches[0]).toMatchObject({ id: 'pcr-1', familyName: 'Doe', givenName: 'Jane', grade: 'certain' })
    expect(result.matches[1]).toMatchObject({ id: 'pcr-2', grade: 'possible' })
    expect(result.resolved).toBe(true)
  })

  it('does not resolve when two candidates are certain', () => {
    const twoCertain = {
      entry: [
        { resource: { resourceType: 'Patient', id: 'a' }, search: { score: 0.99 } },
        { resource: { resourceType: 'Patient', id: 'b' }, search: { score: 0.97 } },
      ],
    }
    expect(parsePatientMatchBundle(twoCertain).resolved).toBe(false)
  })

  it('tolerates an empty or malformed bundle', () => {
    expect(parsePatientMatchBundle(undefined)).toEqual({ matches: [], resolved: false })
    expect(parsePatientMatchBundle({})).toEqual({ matches: [], resolved: false })
  })
})

describe('buildAccessAuditEvent', () => {
  it('produces an AuditEvent referencing the patient and query', () => {
    const evt = buildAccessAuditEvent({
      action: 'R',
      outcome: '0',
      recordedIso: '2026-06-24T12:00:00.000Z',
      agentId: 'oneid|dr.smith',
      query: 'Patient/$match by HCN',
      patientId: 'pcr-1',
    })
    expect(evt.resourceType).toBe('AuditEvent')
    expect(evt.action).toBe('R')
    const entity = (evt.entity as Array<Record<string, unknown>>)[0]
    expect(entity.what).toEqual({ reference: 'Patient/pcr-1' })
  })
})
