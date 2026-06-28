// Zero-infra DEV server — for local exploration & Swagger testing only.
//
// Unlike server.ts (production: real PostgreSQL + Ontario Health credentials),
// this wires the SAME Fastify app to an in-memory database (pg-mem) and the
// in-memory MockGateway. So the whole API — including the Swagger UI at /docs
// and a small admin console at /console — runs with one command, no database
// and no ONE ID / client certificate.
//
//   npm run dev --workspace @triage-link/sync-service
//   → open http://localhost:8080/docs      (API, "Try it out")
//   → open http://localhost:8080/console    (admin console; token: dev-admin)
import { newDb } from 'pg-mem'
import { MockGateway } from '@triage-link/ehr-gateway'
import { buildApp } from './app.js'
import { OpStore, migrate, type Queryable } from './ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from './ehr-audit-store.js'
import { TenantStore, migrateTenants } from './tenant-store.js'
import { AdminAuditStore, migrateAdminAudit } from './admin-audit-store.js'
import { Metrics } from './metrics.js'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin'
const API_TOKEN = 'dev-token' // default-tenant data-plane token (so we can seed metrics)

async function main(): Promise<void> {
  // One in-memory Postgres (pg-mem) backing the op-log, audit, tenants + admin audit.
  const db = newDb()
  const pool = new (db.adapters.createPg().Pool)() as unknown as Queryable
  await migrate(pool)
  await migrateEhrAudit(pool)
  await migrateTenants(pool)
  await migrateAdminAudit(pool)

  const app = buildApp({
    store: new OpStore(pool),
    ehr: new MockGateway(),
    ehrAudit: new EhrAuditStore(pool),
    tenantStore: new TenantStore(pool),
    adminAuditStore: new AdminAuditStore(pool),
    metrics: new Metrics(),
    // Admin API on (token below) + the console; default-tenant data-plane token
    // so seeded /sync calls populate the metrics the console renders.
    security: { adminToken: ADMIN_TOKEN, authToken: API_TOKEN, adminConsole: true },
    docs: true,
  })

  // ---- seed a little demo data so the console isn't empty ----
  const admin = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${ADMIN_TOKEN}` }, payload })
  try {
    await admin('POST', '/admin/tenants', { id: 'org-toronto-ems', name: 'Toronto Paramedic Services' })
    await admin('POST', '/admin/tenants', { id: 'org-field-relief', name: 'Field Relief Intl.' })
    await admin('POST', '/admin/tenants/org-toronto-ems/keys', { label: 'm-12 tablet' })
    await admin('PATCH', '/admin/tenants/org-field-relief', { status: 'disabled' })
    // A couple of authenticated /sync calls so default-tenant metrics are non-zero.
    for (let i = 1; i <= 3; i++) {
      await app.inject({
        method: 'POST', url: '/sync',
        headers: { authorization: `Bearer ${API_TOKEN}` },
        payload: {
          clientId: 'seed', ops: [{
            id: `seed-op-${i}`, recordId: `CAS-${i}`, clientId: 'seed',
            lamport: i, ts: 1_700_000_000_000, kind: 'scalar', path: 'tombstone.name', value: `Casualty ${i}`,
          }],
        },
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('demo seed failed (console still works):', err)
  }

  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '127.0.0.1' })
  // eslint-disable-next-line no-console
  console.log(
    `\n  sync-service DEV (mock EHR, in-memory DB)\n` +
      `  • API      http://localhost:${port}\n` +
      `  • Swagger  http://localhost:${port}/docs\n` +
      `  • OpenAPI  http://localhost:${port}/docs/json\n` +
      `  • Admin    http://localhost:${port}/console#token=${ADMIN_TOKEN}\n`,
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
