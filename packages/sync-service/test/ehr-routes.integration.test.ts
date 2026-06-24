import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { MockGateway } from '@triage-link/ehr-gateway'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

async function makeStore(): Promise<OpStore> {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  return new OpStore(pool)
}

describe('EHR routes', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    const store = await makeStore()
    app = buildApp({ store, ehr: new MockGateway() })
    await app.ready()
  })

  it('reports gateway health and provider', async () => {
    const res = await app.inject({ method: 'GET', url: '/ehr/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ provider: 'mock', ok: true })
  })

  it('resolves a patient via POST /ehr/patient/$match', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ehr/patient/$match',
      payload: { healthCardNumber: '1234567890' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.provider).toBe('mock')
    expect(body.resolved).toBe(true)
    expect(body.matches[0]).toMatchObject({ id: 'pcr-1001', familyName: 'Doe' })
  })

  it('returns an empty match set for an unknown health-card number', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ehr/patient/$match',
      payload: { healthCardNumber: '0000000000' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().matches).toHaveLength(0)
    expect(res.json().resolved).toBe(false)
  })

  it('returns a clinical-context bundle via GET /ehr/patient/:id/context', async () => {
    const res = await app.inject({ method: 'GET', url: '/ehr/patient/pcr-1001/context' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.resourceType).toBe('Bundle')
    const types = body.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType)
    expect(types).toContain('AllergyIntolerance')
  })

  it('does not mount EHR routes when no gateway is wired', async () => {
    const store = await makeStore()
    const bare = buildApp({ store })
    await bare.ready()
    const res = await bare.inject({ method: 'GET', url: '/ehr/health' })
    expect(res.statusCode).toBe(404)
  })
})
