import { describe, it, expect } from 'vitest'
import { EhrError, ONTARIO_SYSTEMS, createEmptyRecord, type FhirResource } from '@triage-link/core'
import { OneIdClient, OntarioHealthGateway, type FetchLike } from '../src/index.js'

interface Recorded {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

/** Build a FetchLike whose handler decides the response per request. */
function fakeFetch(handler: (req: Recorded) => { status: number; body: unknown }): {
  fetch: FetchLike
  calls: Recorded[]
} {
  const calls: Recorded[] = []
  const fetch: FetchLike = async (url, init) => {
    const req: Recorded = { url, method: init?.method, headers: init?.headers, body: init?.body }
    calls.push(req)
    const { status, body } = handler(req)
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }
  }
  return { fetch, calls }
}

const TOKEN_URL = 'https://oneid.example/token'
const FHIR_BASE = 'https://gateway.example/fhir/r4'

function matchBundle() {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'pcr-1001',
          identifier: [{ system: ONTARIO_SYSTEMS.healthCard, value: '1234567890' }],
          name: [{ family: 'Doe', given: ['Jane'] }],
          birthDate: '1990-04-01',
        },
        search: { mode: 'match', score: 0.99 },
      },
    ],
  }
}

function buildGateway(handler: (req: Recorded) => { status: number; body: unknown }, onAudit?: (e: FhirResource) => void) {
  const { fetch, calls } = fakeFetch(handler)
  const oneId = new OneIdClient({
    tokenUrl: TOKEN_URL,
    clientId: 'cid',
    clientSecret: 'secret',
    scope: 'pcr/Patient.read',
    fetchImpl: fetch,
    now: () => 1_000_000,
  })
  const gw = new OntarioHealthGateway({
    fhirBaseUrl: FHIR_BASE,
    oneId,
    requestingAgentId: 'oneid|dr.smith',
    fetchImpl: fetch,
    onAudit,
    now: () => 1_700_000_000_000,
  })
  return { gw, calls }
}

describe('OneIdClient', () => {
  it('requests a client-credentials token and caches it', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { access_token: 'tok-1', expires_in: 300 } }))
    const client = new OneIdClient({ tokenUrl: TOKEN_URL, clientId: 'cid', clientSecret: 'secret', fetchImpl: fetch, now: () => 0 })

    expect(await client.getAccessToken()).toBe('tok-1')
    expect(await client.getAccessToken()).toBe('tok-1') // cached — no second call
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toContain('grant_type=client_credentials')
  })

  it('coalesces concurrent first calls onto a single token fetch', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { access_token: 'tok-1', expires_in: 300 } }))
    const client = new OneIdClient({ tokenUrl: TOKEN_URL, clientId: 'cid', clientSecret: 'secret', fetchImpl: fetch, now: () => 0 })

    const [a, b, c] = await Promise.all([client.getAccessToken(), client.getAccessToken(), client.getAccessToken()])
    expect([a, b, c]).toEqual(['tok-1', 'tok-1', 'tok-1'])
    expect(calls).toHaveLength(1) // not three
  })
})

describe('OntarioHealthGateway.matchPatient', () => {
  it('sends an authenticated $match and parses the resolved patient', async () => {
    const audits: FhirResource[] = []
    const { gw, calls } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-1', expires_in: 300 } }
      return { status: 200, body: matchBundle() }
    }, (e) => audits.push(e))

    const res = await gw.matchPatient({ healthCardNumber: '1234567890' })

    expect(res.resolved).toBe(true)
    expect(res.matches[0]).toMatchObject({ id: 'pcr-1001', familyName: 'Doe' })

    const matchCall = calls.find((c) => c.url.endsWith('/Patient/$match'))!
    expect(matchCall.method).toBe('POST')
    expect(matchCall.headers?.authorization).toBe('Bearer tok-1')
    expect(matchCall.headers?.['content-type']).toBe('application/fhir+json')
    expect(JSON.parse(matchCall.body!).resourceType).toBe('Parameters')

    // Audited as a successful read against the resolved patient.
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ resourceType: 'AuditEvent', action: 'R', outcome: '0' })
  })

  it('rejects an underspecified query before calling the gateway', async () => {
    const { gw, calls } = buildGateway(() => ({ status: 200, body: {} }))
    await expect(gw.matchPatient({ givenName: 'Jane' })).rejects.toMatchObject({ code: 'invalid-request' })
    expect(calls).toHaveLength(0)
  })

  it('refreshes the token once on a 401 and retries', async () => {
    let matchAttempts = 0
    const { gw } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-' + Math.min(2, matchAttempts + 1), expires_in: 300 } }
      matchAttempts++
      if (matchAttempts === 1) return { status: 401, body: { resourceType: 'OperationOutcome' } }
      return { status: 200, body: matchBundle() }
    })

    const res = await gw.matchPatient({ healthCardNumber: '1234567890' })
    expect(res.resolved).toBe(true)
    expect(matchAttempts).toBe(2) // failed once (401), succeeded on retry
  })

  it('fetches context across repositories and merges into one collection bundle', async () => {
    const seen: string[] = []
    const { gw } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-1', expires_in: 300 } }
      seen.push(req.url)
      if (req.url.includes('/MedicationDispense')) {
        return { status: 200, body: { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'MedicationDispense', id: 'md-1' } }] } }
      }
      if (req.url.includes('/AllergyIntolerance')) {
        return { status: 403, body: { resourceType: 'OperationOutcome' } } // not entitled — should be skipped
      }
      return { status: 200, body: { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Observation', id: 'obs-1' } }] } }
    })

    const bundle = await gw.fetchContext('pcr-1001')
    expect(bundle.type).toBe('collection')
    const ids = bundle.entry.map((e) => (e.resource as { id?: string }).id)
    expect(ids).toEqual(['md-1', 'obs-1']) // allergy repo (403) skipped, others merged
    expect(seen.some((u) => u.includes('patient=pcr-1001'))).toBe(true)
  })

  it('contributes a handover as a transaction Bundle without retrying', async () => {
    const audits: FhirResource[] = []
    let posts = 0
    const { gw, calls } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-1', expires_in: 300 } }
      posts++
      return { status: 200, body: { resourceType: 'Bundle', type: 'transaction-response', id: 'tx-9' } }
    }, (e) => audits.push(e))

    const record = createEmptyRecord('CAS-1')
    record.tombstone.name = 'Doe, Jane'
    const result = await gw.contributeHandover(record)

    expect(result).toMatchObject({ accepted: true, id: 'tx-9' })
    const post = calls.find((c) => c.url !== TOKEN_URL && c.method === 'POST')!
    expect(post.url.startsWith(FHIR_BASE)).toBe(true)
    const bundle = JSON.parse(post.body!)
    expect(bundle.type).toBe('transaction')
    expect(bundle.entry[0].request).toMatchObject({ method: 'POST' })
    // Patient identifier promoted to the OHIP system.
    const patient = bundle.entry.find((e: { resource: FhirResource }) => e.resource.resourceType === 'Patient').resource
    expect(patient.identifier[0].system).toBe(ONTARIO_SYSTEMS.healthCard)
    // Audited as a create.
    expect(audits[0]).toMatchObject({ action: 'C', outcome: '0' })
    expect(posts).toBe(1)
  })

  it('does not retry a failed contribution (no duplicate write)', async () => {
    let posts = 0
    const { gw } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-1', expires_in: 300 } }
      posts++
      return { status: 503, body: { resourceType: 'OperationOutcome' } }
    })
    await expect(gw.contributeHandover(createEmptyRecord('CAS-2'))).rejects.toBeInstanceOf(EhrError)
    expect(posts).toBe(1) // 503 is retryable, but writes are not retried
  })

  it('audits a failure outcome and rethrows on a hard error', async () => {
    const audits: FhirResource[] = []
    const { gw } = buildGateway((req) => {
      if (req.url === TOKEN_URL) return { status: 200, body: { access_token: 'tok-1', expires_in: 300 } }
      return { status: 403, body: { resourceType: 'OperationOutcome' } }
    }, (e) => audits.push(e))

    await expect(gw.matchPatient({ healthCardNumber: '1234567890' })).rejects.toBeInstanceOf(EhrError)
    expect(audits[0]).toMatchObject({ action: 'R', outcome: '8' })
  })
})
