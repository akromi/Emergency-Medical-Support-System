// Production entrypoint: wire the app to a real PostgreSQL pool.
// Run with a TypeScript ESM loader (e.g. `tsx src/server.ts`) or compile first.
import { Pool } from 'pg'
import type { EhrGateway } from '@triage-link/core'
import { MockGateway, OneIdClient, OntarioHealthGateway } from '@triage-link/ehr-gateway'
import { buildApp, type SecurityOptions } from './app.js'
import { OpStore, migrate } from './ops-store.js'
import { EhrAuditStore, migrateEhrAudit } from './ehr-audit-store.js'
import { TenantStore, migrateTenants } from './tenant-store.js'
import { AdminAuditStore, migrateAdminAudit } from './admin-audit-store.js'
import { Metrics } from './metrics.js'
import { DEFAULT_TENANT } from './ops-store.js'
import { currentTenant } from './tenant-context.js'
import { createOidcVerifier, type OidcVerifier } from './oidc.js'

// Select the provincial EHR adapter from the environment.
//
// Fails closed: the seeded MockGateway returns fabricated patients, so it is
// NEVER used implicitly. The selection is:
//   - all Ontario/ONE ID vars present  → real OntarioHealthGateway
//   - some but not all present          → throw (a misconfigured prod deploy)
//   - none present + EHR_ALLOW_MOCK=true → MockGateway (explicit dev opt-in)
//   - none present                      → undefined (EHR routes are not mounted)
function buildEhrGateway(audit: EhrAuditStore): EhrGateway | undefined {
  const {
    ONE_ID_TOKEN_URL,
    ONE_ID_CLIENT_ID,
    ONE_ID_CLIENT_SECRET,
    ONE_ID_SCOPE,
    OH_FHIR_BASE_URL,
    OH_AGENT_ID,
    EHR_ALLOW_MOCK,
  } = process.env

  const required = { ONE_ID_TOKEN_URL, ONE_ID_CLIENT_ID, ONE_ID_CLIENT_SECRET, OH_FHIR_BASE_URL }
  const present = Object.entries(required).filter(([, v]) => v)
  const fullyConfigured = present.length === Object.keys(required).length

  if (fullyConfigured) {
    const oneId = new OneIdClient({
      tokenUrl: ONE_ID_TOKEN_URL!,
      clientId: ONE_ID_CLIENT_ID!,
      clientSecret: ONE_ID_CLIENT_SECRET!,
      scope: ONE_ID_SCOPE,
      // dispatcher: <undici Agent with the mTLS client cert> — supply in deploy.
    })
    return new OntarioHealthGateway({
      fhirBaseUrl: OH_FHIR_BASE_URL!,
      oneId,
      requestingAgentId: OH_AGENT_ID ?? 'triage-link-service',
      onAudit: (event) => {
        // Durably persist every EHR access under the in-flight request's tenant
        // (carried via AsyncLocalStorage); surface storage failures in logs but
        // never let an audit-write failure mask the clinical response.
        audit.record(event, currentTenant() ?? DEFAULT_TENANT).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[ehr-audit] failed to persist AuditEvent', err)
        })
      },
    })
  }

  // Partial config is almost certainly a broken production deploy — fail loudly
  // rather than silently degrade to fake data.
  if (present.length > 0) {
    const missing = Object.keys(required).filter((k) => !required[k as keyof typeof required])
    throw new Error(
      `Incomplete Ontario Health / ONE ID configuration (missing: ${missing.join(', ')}). ` +
        'Set all of ONE_ID_TOKEN_URL, ONE_ID_CLIENT_ID, ONE_ID_CLIENT_SECRET, OH_FHIR_BASE_URL — ' +
        'or none, with EHR_ALLOW_MOCK=true for a dev mock.',
    )
  }

  if (EHR_ALLOW_MOCK === 'true') {
    // eslint-disable-next-line no-console
    console.warn('EHR_ALLOW_MOCK=true — serving an in-memory MockGateway with FABRICATED patients. Not for production.')
    return new MockGateway()
  }

  // eslint-disable-next-line no-console
  console.warn('No EHR provider configured (and EHR_ALLOW_MOCK!=true) — EHR routes will not be mounted.')
  return undefined
}

// Transport/access hardening from the environment. A production deploy should
// set SYNC_API_TOKEN (bearer auth) and CORS_ORIGINS (the PWA's origin).
// Per-tenant API keys for a multi-tenant deployment. SYNC_TENANTS is a JSON
// array of { id, token }; each token authenticates AND isolates that tenant's
// data. Malformed config fails loudly rather than silently disabling tenancy.
function parseTenants(): SecurityOptions['tenants'] {
  const raw = process.env.SYNC_TENANTS
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('SYNC_TENANTS must be valid JSON: a list of { "id", "token" } objects.')
  }
  if (!Array.isArray(parsed) || !parsed.every((t) => t && typeof t.id === 'string' && typeof t.token === 'string')) {
    throw new Error('SYNC_TENANTS must be a JSON array of { "id": string, "token": string }.')
  }
  return parsed.map((t) => ({ id: t.id, token: t.token }))
}

function buildSecurity(): SecurityOptions {
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
  const tenants = parseTenants()
  if (!process.env.SYNC_API_TOKEN && !tenants?.length) {
    console.warn('Neither SYNC_API_TOKEN nor SYNC_TENANTS is set — /sync and /ehr/* are UNAUTHENTICATED. Set one in production.')
  }
  if (!corsOrigins?.length) {
    console.warn('CORS_ORIGINS is not set — cross-origin browser requests are blocked (same-origin only).')
  }
  return {
    authToken: process.env.SYNC_API_TOKEN,
    tenants,
    adminToken: process.env.SYNC_ADMIN_TOKEN,
    corsOrigins,
    rateLimitMax: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : undefined,
    trustProxy: process.env.TRUST_PROXY === 'true',
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(pool)
  await migrateEhrAudit(pool)
  await migrateTenants(pool)
  await migrateAdminAudit(pool)
  const ehrAudit = new EhrAuditStore(pool)
  const security = buildSecurity()
  // OIDC admin auth (optional): set OIDC_ISSUER (+ OIDC_AUDIENCE, OIDC_JWKS_URI)
  // to let admins authenticate /admin/* with an IdP-issued JWT.
  const oidcVerifier: OidcVerifier | undefined = process.env.OIDC_ISSUER
    ? createOidcVerifier({ issuer: process.env.OIDC_ISSUER, audience: process.env.OIDC_AUDIENCE, jwksUri: process.env.OIDC_JWKS_URI })
    : undefined
  if (!security.adminToken && !oidcVerifier) {
    console.warn('Neither SYNC_ADMIN_TOKEN nor OIDC_ISSUER is set — the tenant-admin API (/admin/*) is disabled.')
  }
  // Structured access logging is opt-in (LOG_REQUESTS=true) so it doesn't spam
  // dev consoles; per-tenant counters are always collected and exposed at
  // /admin/metrics (when the admin API is enabled).
  const logRequests = process.env.LOG_REQUESTS === 'true'
  const app = buildApp({
    store: new OpStore(pool),
    ehr: buildEhrGateway(ehrAudit),
    ehrAudit,
    tenantStore: new TenantStore(pool),
    adminAuditStore: new AdminAuditStore(pool),
    oidcVerifier,
    metrics: new Metrics(),
    onAccessLog: logRequests ? (e) => console.log(JSON.stringify({ t: 'access', ...e })) : undefined,
    security,
    // Swagger UI is dev/QA furniture — off unless explicitly enabled.
    docs: process.env.ENABLE_DOCS === 'true',
  })
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
