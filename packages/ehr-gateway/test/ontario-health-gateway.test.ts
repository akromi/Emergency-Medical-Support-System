import { describe, it, expect } from 'vitest'
import { EhrError, ONTARIO_SYSTEMS, type FhirResource } from '@triage-link/core'
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
