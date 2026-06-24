// Zero-infra DEV server — for local exploration & Swagger testing only.
//
// Unlike server.ts (production: real PostgreSQL + Ontario Health credentials),
// this wires the SAME Fastify app to an in-memory database (pg-mem) and the
// in-memory MockGateway. So the whole API — including the Swagger UI at /docs —
// runs with one command, no database and no ONE ID / client certificate.
//
//   npm run dev --workspace @triage-link/sync-service
//   → open http://localhost:8080/docs and "Try it out".
import { newDb } from 'pg-mem'
import { MockGateway } from '@triage-link/ehr-gateway'
import { buildApp } from './app.js'
import { OpStore, migrate, type Queryable } from './ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from './ehr-audit-store.js'

async function main(): Promise<void> {
  // One in-memory Postgres (pg-mem) backing both the op-log and the audit trail.
  const db = newDb()
  const pool = new (db.adapters.createPg().Pool)() as unknown as Queryable
  await migrate(pool)
  await migrateEhrAudit(pool)

  const app = buildApp({
    store: new OpStore(pool),
    ehr: new MockGateway(),
    ehrAudit: new EhrAuditStore(pool),
  })

  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '127.0.0.1' })
  // eslint-disable-next-line no-console
  console.log(
    `\n  sync-service DEV (mock EHR, in-memory DB)\n` +
      `  • API      http://localhost:${port}\n` +
      `  • Swagger  http://localhost:${port}/docs\n` +
      `  • OpenAPI  http://localhost:${port}/docs/json\n`,
  )
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
