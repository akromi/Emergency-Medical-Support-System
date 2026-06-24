// Write the OpenAPI document to ./openapi.json — import it into Postman /
// Insomnia, feed a client generator, or diff it in review. Uses the same
// in-memory wiring as the dev server (no database, no credentials).
//
//   npm run openapi:export --workspace @triage-link/sync-service
import { writeFile } from 'node:fs/promises'
import { newDb } from 'pg-mem'
import { MockGateway } from '@triage-link/ehr-gateway'
import { buildApp } from './app.js'
import { OpStore, migrate, type Queryable } from './ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from './ehr-audit-store.js'

async function main(): Promise<void> {
  const pool = new (newDb().adapters.createPg().Pool)() as unknown as Queryable
  await migrate(pool)
  await migrateEhrAudit(pool)
  const app = buildApp({ store: new OpStore(pool), ehr: new MockGateway(), ehrAudit: new EhrAuditStore(pool) })
  await app.ready()
  const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json()
  await app.close()
  const out = new URL('../openapi.json', import.meta.url)
  await writeFile(out, JSON.stringify(doc, null, 2) + '\n')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${Object.keys(doc.paths).length} paths to ${out.pathname}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
