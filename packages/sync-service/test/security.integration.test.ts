import { describe, it, expect } from 'vitest'
import { newDb } from 'pg-mem'
import { buildApp, type SecurityOptions } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'

async function harness(security?: SecurityOptions) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  return buildApp({ store: new OpStore(pool), security })
}

// A minimal op that satisfies the POST /sync request schema.
const validOp = {
  id: 'c1-op-1', recordId: 'CAS-1', clientId: 'c1', lamport: 1, ts: 1_700_000_000_000,
  kind: 'scalar', path: 'tombstone.name', value: 'Doe, Jane',
}

describe('sync-service — bearer auth gate', () => {
  it('rejects /sync without a valid token, accepts with it, leaves /health open', async () => {
    const app = await harness({ authToken: 's3cret' })

    const noAuth = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: [validOp] } })
    expect(noAuth.statusCode).toBe(401)

    const wrong = await app.inject({
      method: 'POST', url: '/sync', headers: { authorization: 'Bearer nope' }, payload: { clientId: 'c1', ops: [validOp] },
    })
    expect(wrong.statusCode).toBe(401)

    const ok = await app.inject({
      method: 'POST', url: '/sync', headers: { authorization: 'Bearer s3cret' }, payload: { clientId: 'c1', ops: [validOp] },
    })
    expect(ok.statusCode).toBe(200)

    // Liveness probe stays reachable without a token.
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)
  })

  it('is open when no token is configured (dev/test default)', async () => {
    const app = await harness()
    const res = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: [validOp] } })
    expect(res.statusCode).toBe(200)
  })
})

describe('sync-service — request validation', () => {
  it('rejects malformed op batches with 400', async () => {
    const app = await harness()
    // Bad enum value for `kind`, a missing required field, and a non-array ops.
    const badKind = await app.inject({
      method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: [{ ...validOp, kind: 'bogus' }] },
    })
    expect(badKind.statusCode).toBe(400)
    const { recordId: _omit, ...missingField } = validOp
    const missing = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: [missingField] } })
    expect(missing.statusCode).toBe(400)
    const notArray = await app.inject({ method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: 'all-of-them' } })
    expect(notArray.statusCode).toBe(400)
  })

  it('strips unknown properties from ops before storing them (sanitization)', async () => {
    const app = await harness()
    const res = await app.inject({
      method: 'POST', url: '/sync', payload: { clientId: 'c1', ops: [{ ...validOp, hacked: true }] },
    })
    expect(res.statusCode).toBe(200)
    // Read the op back: the additionalProperties:false schema dropped the field.
    const got = await app.inject({ method: 'GET', url: '/sync/CAS-1' })
    const ops = (got.json() as { ops: Array<Record<string, unknown>> }).ops
    expect(ops).toHaveLength(1)
    expect(ops[0]).not.toHaveProperty('hacked')
  })
})

describe('sync-service — hardened headers & CORS', () => {
  it('sets security headers (helmet)', async () => {
    const app = await harness()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
  })

  it('reflects only allow-listed CORS origins', async () => {
    const app = await harness({ corsOrigins: ['https://app.example'] })
    const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://app.example' } })
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example')

    const denied = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } })
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })
})
