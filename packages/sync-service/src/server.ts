// Production entrypoint: wire the app to a real PostgreSQL pool.
// Run with a TypeScript ESM loader (e.g. `tsx src/server.ts`) or compile first.
import { Pool } from 'pg'
import type { EhrGateway } from '@triage-link/core'
import { MockGateway, OneIdClient, OntarioHealthGateway } from '@triage-link/ehr-gateway'
import { buildApp } from './app.js'
import { OpStore, migrate } from './ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from './ehr-audit-store.js'

// Select the provincial EHR adapter from the environment. With no ONE ID
// credentials configured we fall back to an in-memory mock so the service runs
// end-to-end in dev without a sandbox connection.
function buildEhrGateway(audit: EhrAuditStore): EhrGateway {
  const {
    ONE_ID_TOKEN_URL,
    ONE_ID_CLIENT_ID,
    ONE_ID_CLIENT_SECRET,
    ONE_ID_SCOPE,
    OH_FHIR_BASE_URL,
    OH_AGENT_ID,
  } = process.env

  if (ONE_ID_TOKEN_URL && ONE_ID_CLIENT_ID && ONE_ID_CLIENT_SECRET && OH_FHIR_BASE_URL) {
    const oneId = new OneIdClient({
      tokenUrl: ONE_ID_TOKEN_URL,
      clientId: ONE_ID_CLIENT_ID,
      clientSecret: ONE_ID_CLIENT_SECRET,
      scope: ONE_ID_SCOPE,
      // dispatcher: <undici Agent with the mTLS client cert> — supply in deploy.
    })
    return new OntarioHealthGateway({
      fhirBaseUrl: OH_FHIR_BASE_URL,
      oneId,
      requestingAgentId: OH_AGENT_ID ?? 'triage-link-service',
      onAudit: (event) => {
        // Durably persist every EHR access; surface storage failures in logs
        // but never let an audit-write failure mask the clinical response.
        audit.record(event).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[ehr-audit] failed to persist AuditEvent', err)
        })
      },
    })
  }

  // eslint-disable-next-line no-console
  console.warn('ONE ID not configured — using in-memory MockGateway for the EHR routes')
  return new MockGateway()
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(pool)
  await migrateEhrAudit(pool)
  const ehrAudit = new EhrAuditStore(pool)
  const app = buildApp({ store: new OpStore(pool), ehr: buildEhrGateway(ehrAudit), ehrAudit })
  const port = Number(process.env.PORT ?? 8080)
  await app.listen({ port, host: '0.0.0.0' })
  // eslint-disable-next-line no-console
  console.log(`sync-service listening on :${port}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
