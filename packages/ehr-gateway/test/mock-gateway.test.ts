import { describe, it, expect } from 'vitest'
import { createEmptyRecord } from '@triage-link/core'
import { MockGateway } from '../src/index.js'

describe('MockGateway', () => {
  const gw = new MockGateway()

  it('resolves a single certain match on exact health-card number', async () => {
    const res = await gw.matchPatient({ healthCardNumber: '1234567890' })
    expect(res.resolved).toBe(true)
    expect(res.matches).toHaveLength(1)
    expect(res.matches[0]).toMatchObject({ id: 'pcr-1001', familyName: 'Doe', grade: 'certain' })
  })

  it('returns a non-resolved probable match on name + dob', async () => {
    const res = await gw.matchPatient({ familyName: 'Doe', givenName: 'Jane', birthDate: '1990-04-01' })
    expect(res.resolved).toBe(false)
    expect(res.matches[0]).toMatchObject({ id: 'pcr-1001', grade: 'probable' })
  })

  it('returns no matches for an unknown patient', async () => {
    const res = await gw.matchPatient({ healthCardNumber: '0000000000' })
    expect(res.matches).toHaveLength(0)
    expect(res.resolved).toBe(false)
  })

  it('returns seeded clinical context for a known patient', async () => {
    const bundle = await gw.fetchContext('pcr-1001')
    expect(bundle.type).toBe('collection')
    const types = bundle.entry.map((e) => (e.resource as { resourceType: string }).resourceType)
    expect(types).toContain('AllergyIntolerance')
    expect(types).toContain('MedicationDispense')
  })

  it('returns an empty context bundle for a patient with none', async () => {
    const bundle = await gw.fetchContext('pcr-1002')
    expect(bundle.entry).toHaveLength(0)
  })

  it('accepts a contributed handover and records it', async () => {
    const local = new MockGateway()
    const record = createEmptyRecord('CAS-XYZ')
    const result = await local.contributeHandover(record)
    expect(result).toMatchObject({ accepted: true, id: 'mock-tx-CAS-XYZ' })
    expect(local.contributed).toHaveLength(1)
    expect(local.contributed[0].id).toBe('CAS-XYZ')
  })
})
