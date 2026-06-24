import { describe, it, expect } from 'vitest'
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
})
