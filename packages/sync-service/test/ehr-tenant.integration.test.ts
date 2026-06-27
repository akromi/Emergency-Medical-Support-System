import { describe, it, expect, beforeEach } from 'vitest'
import { newDb } from 'pg-mem'
import { buildAccessAuditEvent, type EhrGateway, type FhirResource } from '@triage-link/core'
import { buildApp } from '../src/app.js'
import { OpStore, migrate, DEFAULT_TENANT, type Queryable } from '../src/ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from '../src/ehr-audit-store.js'
import { TenantStore, migrateTenants } from '../src/tenant-store.js'
import { currentTenant } from '../src/tenant-context.js'

const TOKENS = { a: 'key-a', b: 'key-b' }

// A gateway that fires onAudit during matchPatient — like the real Ontario
// gateway — so we can verify the EHR audit row is written under the request's
// tenant (carried via AsyncLocalStorage) and read back tenant-scoped.
function fakeGateway(onAudit: (e: FhirResource) => Promise<void>): EhrGateway {
  return {
    provider: 'fake',
    ping: async () => true,
    matchPatient: async () => {
      await onAudit(buildAccessAuditEvent({
        action: 'R', outcome: '0', recordedIso: '2026-06-24T12:00:00.000Z',
        agentId: 'oneid|dr.smith', query: 'Patient/$match', patientId: 'pcr-1',
      }))
      return { resolved: true, matches: [] }
    },
  } as unknown as EhrGateway
}

async function harness() {
  const db = newDb()
  const pg = db.adapters.createPg()
  const pool = new pg.Pool() as unknown as Queryable
  await migrate(pool)
  await migrateEhrAudit(pool)
  await migrateTenants(pool)
  const ehrAudit = new EhrAuditStore(pool)
  const ehr = fakeGateway((event) => ehrAudit.record(event, currentTenant() ?? DEFAULT_TENANT))
  const app = buildApp({
    store: new OpStore(pool),
    ehr,
    ehrAudit,
    tenantStore: new TenantStore(pool),
    security: { tenants: [{ id: 'org-a', token: TOKENS.a }, { id: 'org-b', token: TOKENS.b }] },
  })
  const match = (token: string) =>
    app.inject({ method: 'POST', url: '/ehr/patient/$match', headers: { authorization: `Bearer ${token}` }, payload: { healthCardNumber: '1' } })
  const readAudit = (token: string) =>
    app.inject({ method: 'GET', url: '/ehr/audit', headers: { authorization: `Bearer ${token}` } })
  return { app, match, readAudit }
}

describe('per-tenant EHR audit', () => {
  let h: Awaited<ReturnType<typeof harness>>
  beforeEach(async () => { h = await harness() })

  it('writes the audit under the calling tenant and reads it back scoped', async () => {
    expect((await h.match(TOKENS.a)).statusCode).toBe(200)
    expect((await h.match(TOKENS.a)).statusCode).toBe(200)
    expect((await h.match(TOKENS.b)).statusCode).toBe(200)

    const aEntries = (await h.readAudit(TOKENS.a)).json().entries
    expect(aEntries).toHaveLength(2)
    expect(aEntries.every((e: { tenantId: string }) => e.tenantId === 'org-a')).toBe(true)

    const bEntries = (await h.readAudit(TOKENS.b)).json().entries
    expect(bEntries).toHaveLength(1)
    expect(bEntries[0].tenantId).toBe('org-b')
  })

  it('requires a tenant token to read /ehr/audit', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/ehr/audit' })).statusCode).toBe(401)
  })
})
