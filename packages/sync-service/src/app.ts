// Fastify sync endpoint. The merge/resolution authority is @triage-link/core's
// deterministic resolver — the server stores ops and folds them; it does not
// implement its own (divergent) merge logic.
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { resolve, type Op, type EhrGateway } from '@triage-link/core'
import { OpStore, DEFAULT_TENANT } from './ops-store.js'
import { registerEhrRoutes, registerEhrAuditRoute } from './ehr-routes.js'
import type { EhrAuditStore } from './ehr-audit-store.js'
import { type TenantStore, bearerToken } from './tenant-store.js'
import { registerAdminRoutes } from './admin-routes.js'
import type { Metrics, AccessLogEntry } from './metrics.js'
import type { AdminAuditStore } from './admin-audit-store.js'
import type { OidcVerifier } from './oidc.js'

// The authenticated tenant for the current request (DEFAULT_TENANT when auth is
// off or the single-tenant authToken is used).
declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string
    /** The authenticated admin's OIDC subject, or null for the static admin
     *  token (and on non-admin routes). Recorded as the admin-audit actor. */
    adminSubject: string | null
  }
}

interface SyncBody {
  clientId?: string
  ops?: Op[]
  /** Cursor from the client's last sync. When present, the response returns only
   *  ops/records changed since it (incremental); absent → full state. */
  since?: number
}

/** Hardening knobs for a deployed instance (all optional; off by default so
 *  dev/tests stay open). A production deploy should set at least `authToken`
 *  and `corsOrigins`. */
export interface SecurityOptions {
  /** When set, `/sync` and `/ehr/*` require `Authorization: Bearer <token>`.
   *  This is the single-tenant token — requests authenticated with it are scoped
   *  to the `default` tenant. */
  authToken?: string
  /** Per-tenant API keys for a multi-tenant deployment: each `{ id, token }`
   *  authenticates requests AND scopes their data to that tenant. Tenants are
   *  fully isolated — one can never read or resolve another's records. May be
   *  combined with `authToken` (which remains the `default` tenant). For
   *  runtime-managed tenants/keys, wire a `tenantStore` (see buildApp) instead. */
  tenants?: Array<{ id: string; token: string }>
  /** When set (with a `tenantStore`), mounts the tenant-admin API under
   *  `/admin/*`, gated by `Authorization: Bearer <adminToken>`. */
  adminToken?: string
  /** Per-tenant `/sync` request budget per minute (default 1000). */
  syncRateLimitMax?: number
  /** Allowed browser origins for CORS. Empty/undefined → cross-origin disabled. */
  corsOrigins?: string[]
  /** Max requests per IP per minute (default 300). */
  rateLimitMax?: number
  /** Max request body size in bytes (default 10 MB — handover bundles embed photos). */
  bodyLimit?: number
  /** Trust `X-Forwarded-*` (enable behind a reverse proxy / load balancer). */
  trustProxy?: boolean
}

/** Constant-time bearer-token check (avoids leaking the token via timing). */
function bearerOk(header: string | undefined, token: string): boolean {
  if (!header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${token}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Request validation for POST /sync — rejects malformed/oversized op batches at
// the edge (Ajv via Fastify) instead of trusting the client payload.
const OP_SCHEMA = {
  type: 'object',
  required: ['id', 'recordId', 'clientId', 'lamport', 'ts', 'kind', 'path'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 256 },
    recordId: { type: 'string', maxLength: 256 },
    clientId: { type: 'string', maxLength: 256 },
    lamport: { type: 'integer', minimum: 0 },
    ts: { type: 'integer', minimum: 0 },
    kind: { type: 'string', enum: ['scalar', 'item-put', 'item-remove'] },
    path: { type: 'string', maxLength: 256 },
    itemId: { type: 'string', maxLength: 256 },
    value: {},
  },
}
const SYNC_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clientId: { type: 'string', maxLength: 256 },
    ops: { type: 'array', maxItems: 10000, items: OP_SCHEMA },
    since: { type: 'integer', minimum: 0 },
  },
}

export function buildApp(
  { store, ehr, ehrAudit, tenantStore, adminAuditStore, oidcVerifier, metrics, onAccessLog, docs = true, security = {} }: {
    store: OpStore
    ehr?: EhrGateway
    ehrAudit?: EhrAuditStore
    /** Runtime tenant registry. When provided, bearer tokens are also resolved
     *  against its stored (hashed) API keys; with `security.adminToken` it also
     *  mounts the tenant-admin API at `/admin/*`. */
    tenantStore?: TenantStore
    /** Audit trail for admin-action logging; with the admin API, mutations are
     *  recorded and readable at `/admin/audit`. */
    adminAuditStore?: AdminAuditStore
    /** OIDC verifier for the admin surface. When provided, a valid IdP-issued
     *  JWT authenticates `/admin/*` (alongside the static `adminToken`, if any). */
    oidcVerifier?: OidcVerifier
    /** Per-tenant operational counters. When provided, requests are counted and
     *  (with the admin API) exposed at `/admin/metrics`. */
    metrics?: Metrics
    /** Structured access-log sink (method, path, tenant, status, latency).
     *  Called once per response when provided; off by default so dev/tests stay quiet. */
    onAccessLog?: (entry: AccessLogEntry) => void
    /** Serve OpenAPI + Swagger UI at /docs (default true). */
    docs?: boolean
    /** Transport/access hardening (see SecurityOptions). */
    security?: SecurityOptions
  },
): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: security.bodyLimit ?? 10 * 1024 * 1024,
    trustProxy: security.trustProxy ?? false,
    // Request-id correlation: honour an inbound x-request-id (so a trace spans the
    // PWA → this service → the EHR gateway), else mint a fresh UUID.
    genReqId: (req) => {
      const h = req.headers['x-request-id']
      return typeof h === 'string' && h.length > 0 && h.length <= 200 ? h : randomUUID()
    },
  })

  // Echo the request id on every response (set first, so even a 401/429/parse
  // error carries it) and expose it for the access log.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id)
  })

  // ---- security middleware (registered first, so it wraps every route) ----
  // Hardened response headers (nosniff, frameguard DENY, HSTS, no-referrer, …).
  // CSP is disabled here: this tier serves JSON and (in dev) Swagger UI; the
  // browser Content-Security-Policy belongs to the web app, not the API.
  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' }, // an API is never meant to be framed
  })

  // Default-deny CORS: only explicitly-configured browser origins may call the
  // API; with none set, cross-origin requests get no CORS headers (blocked).
  app.register(cors, {
    origin: security.corsOrigins && security.corsOrigins.length ? security.corsOrigins : false,
    methods: ['GET', 'POST'],
    maxAge: 600,
  })

  // Abuse / DoS guard — per-IP request budget.
  app.register(rateLimit, { max: security.rateLimitMax ?? 300, timeWindow: '1 minute' })

  // Every request carries a tenant; it stays DEFAULT_TENANT unless authentication
  // resolves a specific one. Decorated unconditionally so handlers can always
  // read req.tenantId (dev/tests with no auth run under the single default tenant).
  app.decorateRequest('tenantId', DEFAULT_TENANT)
  app.decorateRequest('adminSubject', null)

  // Bearer-token gate on the data + EHR routes (/health stays open for probes).
  // Active only when at least one token is configured, so dev/tests stay open; a
  // production deploy MUST configure one (server.ts reads SYNC_API_TOKEN /
  // SYNC_TENANTS). The matched token also selects the request's tenant, which
  // scopes every store read/write — so isolation is enforced at the data layer,
  // not merely at the edge.
  const tenantTokens: Array<{ id: string; token: string }> = [
    ...(security.tenants ?? []),
    ...(security.authToken ? [{ id: DEFAULT_TENANT, token: security.authToken }] : []),
  ]
  const adminToken = security.adminToken
  const adminAuthConfigured = !!adminToken || !!oidcVerifier

  // Authorize an admin request: the static admin token OR a valid IdP-issued
  // JWT (OIDC). Returns the principal (with its OIDC subject, null for the
  // static token) on success, or null to deny.
  const adminPrincipal = async (header: string | undefined): Promise<{ subject: string | null } | null> => {
    if (adminToken && bearerOk(header, adminToken)) return { subject: null }
    const token = oidcVerifier ? bearerToken(header) : null
    if (!token) return null
    // Grant only after the verifier accepts the token (signature + iss + aud +
    // exp + required claim); any failure denies. Gated by verification, not by a
    // user-controlled value.
    try {
      const claims = await oidcVerifier!.verify(token)
      // An SSO-authenticated admin MUST carry a usable subject, otherwise its
      // actions would be indistinguishable from the shared static token in the
      // admin-audit trail. Deny a token with no string `sub`.
      const subject = typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null
      return subject ? { subject } : null
    } catch {
      return null
    }
  }

  // Resolve a bearer credential to a tenant id: static tokens first
  // (constant-time; first match wins, count isn't secret), then the runtime
  // store's hashed keys. Null when no credential matches.
  const resolveTenant = async (authHeader: string | undefined): Promise<string | null> => {
    const staticId = tenantTokens.find((t) => bearerOk(authHeader, t.token))?.id
    if (staticId) return staticId
    const token = bearerToken(authHeader)
    if (token && tenantStore) return tenantStore.resolveToken(token)
    return null
  }

  // Data routes are authenticated when any static token is configured OR the
  // admin API is enabled (which implies runtime-managed DB credentials). With
  // none of these, the service stays open under the single default tenant.
  const dataAuthEnabled = tenantTokens.length > 0 || adminAuthConfigured
  if (dataAuthEnabled || adminAuthConfigured) {
    app.addHook('onRequest', async (req, reply) => {
      const path = req.url.split('?')[0]

      // Admin API: its own gate (static admin token or OIDC), separate from tenants.
      if (path.startsWith('/admin')) {
        const principal = await adminPrincipal(req.headers.authorization)
        if (!principal) {
          return reply.code(401).send({ error: 'unauthorized', message: 'Admin authentication required' })
        }
        req.adminSubject = principal.subject // recorded as the admin-audit actor
        return
      }

      const protectedRoute = path === '/sync' || path.startsWith('/sync/') || path.startsWith('/ehr')
      if (!protectedRoute || !dataAuthEnabled) return

      const tenantId = await resolveTenant(req.headers.authorization)
      if (!tenantId) {
        return reply.code(401).send({ error: 'unauthorized', message: 'Missing or invalid bearer token' })
      }
      req.tenantId = tenantId
    })
  }

  // Per-tenant budget for /sync. The limiter's onRequest hook may fire before the
  // auth hook that sets req.tenantId, so resolve the tenant from the credential
  // directly here (static map, or the same hashed-key lookup) — keeping the
  // bucket per-tenant regardless of hook order. Unauthenticated / invalid
  // attempts fall back to per-IP and never share a tenant's bucket.
  const syncRateLimit = {
    max: security.syncRateLimitMax ?? 1000,
    timeWindow: '1 minute',
    keyGenerator: async (req: FastifyRequest): Promise<string> => {
      if (req.tenantId && req.tenantId !== DEFAULT_TENANT) return req.tenantId
      return (await resolveTenant(req.headers.authorization)) ?? req.ip
    },
  }

  // Per-tenant observability: count each response and emit a structured access
  // log. onResponse runs after the auth hook, so req.tenantId is resolved.
  if (metrics || onAccessLog) {
    app.addHook('onResponse', async (req, reply) => {
      const path = req.url.split('?')[0]
      // Count responses only for the tenant data plane (/sync, /ehr), where
      // req.tenantId is a real tenant. Admin, health, and the Prometheus scrape
      // itself leave tenantId as 'default', so counting them would invent a
      // bogus `default` series that inflates just because monitoring is on.
      const dataPlane = path === '/sync' || path.startsWith('/sync/') || path.startsWith('/ehr')
      if (metrics && dataPlane) metrics.recordResponse(req.tenantId, reply.statusCode)
      onAccessLog?.({
        requestId: String(req.id),
        method: req.method,
        path,
        tenant: req.tenantId,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      })
    })
  }

  // OpenAPI doc + interactive Swagger UI. Registered before routes so the
  // onRoute hook captures every endpoint and its schema. Run the service with
  // EHR_ALLOW_MOCK=true and open /docs to exercise the (stubbed) EHR API by
  // hand — no ONE ID credentials or client certificate required.
  if (docs) {
    app.register(swagger, {
      openapi: {
        info: {
          title: 'TRIAGE-LINK sync & EHR API',
          version: '0.1.0',
          description:
            'Conflict-aware record sync plus the provincial-EHR integration. In dev the EHR routes ' +
            'are backed by an in-memory MockGateway (set EHR_ALLOW_MOCK=true), so "Send to EHR" and ' +
            'patient $match can be tested end-to-end against stubbed data.',
        },
        tags: [
          { name: 'ehr', description: 'Provincial EHR integration (PCR $match, handover contribution, context).' },
          { name: 'sync', description: 'Op-log sync and record inspection.' },
        ],
      },
    })
    app.register(swaggerUi, { routePrefix: '/docs' })
  }

  // All routes live inside a deferred plugin registered AFTER @fastify/swagger,
  // so its (fastify-plugin) onRoute hook is attached before these routes are
  // added and every endpoint lands in the OpenAPI document. The inner `app`
  // shadows the outer instance, so the route bodies below read unchanged.
  app.register(async (app) => {
  app.get('/health', { schema: { tags: ['sync'], summary: 'Liveness probe' } }, async () => ({ ok: true }))

  // Readiness probe (distinct from liveness): 200 only when the database answers,
  // else 503 so an orchestrator stops routing traffic to an instance that can't
  // serve. Unauthenticated, like /health.
  app.get('/ready', { schema: { tags: ['sync'], summary: 'Readiness probe (DB connectivity)' } }, async (_req, reply) => {
    const ready = await store.ping()
    return reply.code(ready ? 200 : 503).send({ ready })
  })

  // Provincial EHR integration is optional: only mounted when a gateway is wired.
  if (ehr) registerEhrRoutes(app, ehr)
  if (ehrAudit) registerEhrAuditRoute(app, ehrAudit)

  // Tenant-admin API — only when a tenant store AND admin auth (static token or
  // OIDC) are configured.
  if (tenantStore && adminAuthConfigured) registerAdminRoutes(app, tenantStore, metrics, adminAuditStore)

  // Push a batch of ops and pull back the resolved state + full op set.
  app.post('/sync', {
    config: { rateLimit: syncRateLimit },
    schema: { tags: ['sync'], summary: 'Push ops, pull resolved state', body: SYNC_BODY_SCHEMA },
  }, async (req, reply) => {
    const body = (req.body ?? {}) as SyncBody
    const ops = Array.isArray(body.ops) ? body.ops : []
    const tenantId = req.tenantId // scopes every store call below to this tenant

    // Idempotent ingest: only ids not already present are inserted.
    const inserted = new Set(await store.insertOps(ops, tenantId))
    metrics?.incSyncRequest(tenantId)
    metrics?.addOpsIngested(tenantId, inserted.size)
    for (const op of ops) {
      if (inserted.has(op.id)) {
        await store.appendAudit({
          recordId: op.recordId,
          opId: op.id,
          eventType: 'op-ingested',
          detail: { clientId: op.clientId, kind: op.kind, path: op.path, itemId: op.itemId ?? null },
        }, tenantId)
      }
    }

    // Only re-resolve records that actually gained ops (keeps no-op syncs cheap
    // and the audit trail free of duplicate resolution events).
    const changed = [...new Set(ops.filter((o) => inserted.has(o.id)).map((o) => o.recordId))]
    let newConflicts = 0
    for (const recordId of changed) {
      const all = await store.getOps(recordId, tenantId)
      const { record, conflicts } = resolve(recordId, all)
      await store.upsertSnapshot(recordId, record, tenantId)
      // Only audit conflicts touched by THIS ingest — re-folding the full history
      // would otherwise re-log every pre-existing conflict on each sync.
      for (const c of conflicts) {
        const involvesNewOp = inserted.has(c.winningOpId) || c.supersededOpIds.some((id) => inserted.has(id))
        if (involvesNewOp) {
          await store.appendAudit({ recordId, opId: c.winningOpId, eventType: 'conflict-resolved', detail: c }, tenantId)
          newConflicts += 1
        }
      }
    }
    metrics?.addConflicts(tenantId, newConflicts)

    // The tenant's current high-water cursor — clients checkpoint it and send it
    // back as `since` to pull only the delta next time.
    const cursor = await store.maxSeq(tenantId)

    // Resolve a record's snapshot, materializing it on demand if missing (a pure
    // replay sync, or a snapshot that was never persisted) so the client never
    // receives null for a record it has ops for.
    const snapshotOf = async (recordId: string): Promise<unknown> => {
      let snapshot = await store.getSnapshot(recordId, tenantId)
      if (snapshot == null) {
        const recOps = await store.getOps(recordId, tenantId)
        if (recOps.length === 0) return null
        snapshot = resolve(recordId, recOps).record
        await store.upsertSnapshot(recordId, snapshot, tenantId)
      }
      return snapshot
    }

    // Incremental: only the ops appended since the client's cursor, and snapshots
    // for just the records those ops touched. Wall-cost scales with the delta,
    // not the whole caseload.
    if (typeof body.since === 'number') {
      const opsSince = await store.getOpsSince(body.since, tenantId)
      const records: Record<string, unknown> = {}
      for (const recordId of new Set(opsSince.map((o) => o.recordId))) {
        records[recordId] = await snapshotOf(recordId)
      }
      return reply.send({ records, ops: opsSince, ingested: inserted.size, cursor })
    }

    // Full state (first sync, or a client without a cursor): every record THIS
    // TENANT knows about, so a device receives cases created on other devices in
    // the same tenant — multi-device caseload sharing.
    const knownRecordIds = await store.allRecordIds(tenantId)
    const records: Record<string, unknown> = {}
    let merged: Op[] = []
    for (const recordId of knownRecordIds) {
      records[recordId] = await snapshotOf(recordId)
      merged = merged.concat(await store.getOps(recordId, tenantId))
    }
    return reply.send({ records, ops: merged, ingested: inserted.size, cursor })
  })

  // Inspect a record: resolved snapshot, its full op-log, and the audit trail.
  app.get('/sync/:recordId', async (req) => {
    const { recordId } = req.params as { recordId: string }
    const tenantId = req.tenantId
    const [stored, ops, audit] = await Promise.all([
      store.getSnapshot(recordId, tenantId),
      store.getOps(recordId, tenantId),
      store.getAudit(recordId, tenantId),
    ])
    // Same contract as POST /sync: never return null for a record that has ops.
    let snapshot = stored
    if (snapshot == null && ops.length > 0) {
      snapshot = resolve(recordId, ops).record
      await store.upsertSnapshot(recordId, snapshot, tenantId)
    }
    return { snapshot, ops, audit }
  })
  })

  return app
}
