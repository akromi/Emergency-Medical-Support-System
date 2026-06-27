import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, type Queryable } from '../src/ops-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'
import { createOidcVerifier } from '../src/oidc.js'

const ISSUER = 'https://idp.test'
const AUDIENCE = 'triage-admin'
const KID = 'test-key'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }] }

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url')
function jwt(claims: Record<string, unknown>, opts: { alg?: string; key?: KeyObject } = {}): string {
  const alg = opts.alg ?? 'RS256'
  const data = `${b64(JSON.stringify({ alg, kid: KID, typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`
  if (alg === 'none') return `${data}.`
  const sig = createSign('sha256').update(data).end().sign(opts.key ?? privateKey)
  return `${data}.${b64(sig)}`
}

const now = () => Math.floor(Date.now() / 1000)
const validClaims = () => ({ iss: ISSUER, aud: AUDIENCE, sub: 'admin-1', iat: now(), exp: now() + 3600 })

// Stub the IdP: serve the discovery doc and the JWKS.
const idpFetch = async (url: string) => {
  if (url === `${ISSUER}/.well-known/openid-configuration`) {
    return { ok: true, status: 200, json: async () => ({ jwks_uri: `${ISSUER}/jwks` }) }
  }
  if (url === `${ISSUER}/jwks`) return { ok: true, status: 200, json: async () => jwks }
  return { ok: false, status: 404, json: async () => ({}) }
}

async function harness(opts: { adminToken?: string } = {}) {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateTenants(pool)
  const verifier = createOidcVerifier({ issuer: ISSUER, audience: AUDIENCE }, { fetch: idpFetch }) // discovery, no jwksUri
  const app = buildApp({
    store: new OpStore(pool),
    tenantStore: new TenantStore(pool),
    oidcVerifier: verifier,
    security: { adminToken: opts.adminToken },
  })
  const adminGet = (auth?: string) =>
    app.inject({ method: 'GET', url: '/admin/tenants', ...(auth ? { headers: { authorization: auth } } : {}) })
  return { app, adminGet }
}

describe('OIDC admin authentication', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('accepts a valid IdP-issued JWT (via discovery + JWKS)', async () => {
    const res = await h.adminGet(`Bearer ${jwt(validClaims())}`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('tenants')
  })

  it('rejects no token, wrong issuer, wrong audience, and expired tokens', async () => {
    expect((await h.adminGet()).statusCode).toBe(401)
    expect((await h.adminGet(`Bearer ${jwt({ ...validClaims(), iss: 'https://evil.test' })}`)).statusCode).toBe(401)
    expect((await h.adminGet(`Bearer ${jwt({ ...validClaims(), aud: 'someone-else' })}`)).statusCode).toBe(401)
    expect((await h.adminGet(`Bearer ${jwt({ ...validClaims(), exp: now() - 10 })}`)).statusCode).toBe(401)
  })

  it('rejects a tampered signature', async () => {
    const token = jwt(validClaims())
    const tampered = token.slice(0, -3) + (token.endsWith('aaa') ? 'bbb' : 'aaa')
    expect((await h.adminGet(`Bearer ${tampered}`)).statusCode).toBe(401)
  })

  it('rejects alg=none and HS256 (alg-confusion guard)', async () => {
    expect((await h.adminGet(`Bearer ${jwt(validClaims(), { alg: 'none' })}`)).statusCode).toBe(401)
    // HS256 token "signed" with the public key as the HMAC secret — the classic attack.
    const hs = `${b64(JSON.stringify({ alg: 'HS256', kid: KID }))}.${b64(JSON.stringify(validClaims()))}.x`
    expect((await h.adminGet(`Bearer ${hs}`)).statusCode).toBe(401)
  })

  it('still accepts the static admin token when both are configured', async () => {
    const both = await harness({ adminToken: 'admin-secret' })
    expect((await both.adminGet('Bearer admin-secret')).statusCode).toBe(200)
    expect((await both.adminGet(`Bearer ${jwt(validClaims())}`)).statusCode).toBe(200)
    expect((await both.adminGet('Bearer wrong')).statusCode).toBe(401)
  })
})
