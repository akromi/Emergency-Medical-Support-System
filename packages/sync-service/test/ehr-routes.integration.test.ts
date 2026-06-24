import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { MockGateway, OneIdClient, OntarioHealthGateway, type FetchLike } from '@triage-link/ehr-gateway'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from '../src/ehr-audit-store.js'

function makePool(): Queryable {
  const db = newDb()
  const pg = db.adapters.createPg()
  return new pg.Pool() as unknown as Queryable
}

async function makeStore(): Promise<OpStore> {
  const pool = makePool()
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

  it('serves an OpenAPI document describing the EHR routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(res.statusCode).toBe(200)
    const doc = res.json()
    expect(doc.openapi).toMatch(/^3\./)
    expect(Object.keys(doc.paths)).toContain('/ehr/handover')
    expect(Object.keys(doc.paths)).toContain('/ehr/patient/$match')
  })

  it('rejects a non-object $match body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ehr/patient/$match',
      headers: { 'content-type': 'application/json' },
      payload: '"not-an-object"',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid-request')
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

  it('contributes a handover via POST /ehr/handover', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ehr/handover',
      payload: { id: 'CAS-9', tombstone: { name: 'Doe, Jane' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ provider: 'mock', accepted: true, id: 'mock-tx-CAS-9' })
  })

  it('rejects a handover body without an id', async () => {
    const res = await app.inject({ method: 'POST', url: '/ehr/handover', payload: { tombstone: {} } })
    expect(res.statusCode).toBe(400)
  })

  it('does not mount EHR routes when no gateway is wired', async () => {
    const store = await makeStore()
    const bare = buildApp({ store })
    await bare.ready()
    const res = await bare.inject({ method: 'GET', url: '/ehr/health' })
    expect(res.statusCode).toBe(404)
  })
})

describe('EHR audit persistence (end-to-end)', () => {
  // Fake fetch: ONE ID token + a PCR $match searchset.
  const fetchImpl: FetchLike = async (url) => {
    const body = url.includes('/token')
      ? { access_token: 'tok-1', expires_in: 300 }
      : {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: { resourceType: 'Patient', id: 'pcr-1001' }, search: { score: 0.99 } }],
        }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  }

  it('persists an AuditEvent on $match and serves it from GET /ehr/audit', async () => {
    const store = await makeStore()
    const auditPool = makePool()
    await migrateEhrAudit(auditPool)
    const ehrAudit = new EhrAuditStore(auditPool)

    const oneId = new OneIdClient({ tokenUrl: 'https://oneid/token', clientId: 'c', clientSecret: 's', fetchImpl, now: () => 0 })
    const ehr = new OntarioHealthGateway({
      fhirBaseUrl: 'https://gw/fhir/r4',
      oneId,
      requestingAgentId: 'oneid|dr.smith',
      fetchImpl,
      onAudit: (e) => ehrAudit.record(e),
    })

    const app = buildApp({ store, ehr, ehrAudit })
    await app.ready()

    const match = await app.inject({ method: 'POST', url: '/ehr/patient/$match', payload: { healthCardNumber: '1234567890' } })
    expect(match.statusCode).toBe(200)
    expect(match.json().resolved).toBe(true)

    const audit = await app.inject({ method: 'GET', url: '/ehr/audit' })
    expect(audit.statusCode).toBe(200)
    const entries = audit.json().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'R', outcome: '0', agentId: 'oneid|dr.smith', patientRef: 'Patient/pcr-1001' })
  })
})
