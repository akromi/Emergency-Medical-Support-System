// Tenant-administration API: provision tenants and issue / rotate / revoke
// their API keys at runtime. Gated by the admin token (see app.ts) and hidden
// from the public OpenAPI doc — this is an operational surface, not a client API.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { TenantStore } from './tenant-store.js'
import { type Metrics, renderPrometheus, PROMETHEUS_CONTENT_TYPE } from './metrics.js'
import type { AdminAuditStore, AdminAction } from './admin-audit-store.js'
import { type OpStore, DEFAULT_TENANT } from './ops-store.js'
import { pruneTenantAudit, type RetentionConfig } from './retention.js'

// The global rate-limit covers every route, but the admin surface is sensitive
// (admin-token auth + key issuance), so it gets its own explicit, stricter
// per-route budget — which also makes the limiter visible on each handler.
const ADMIN_RATE_LIMIT = { max: 60, timeWindow: '1 minute' }
const HIDDEN = { config: { rateLimit: ADMIN_RATE_LIMIT }, schema: { hide: true } } as const
const opts = (body?: object) => ({
  config: { rateLimit: ADMIN_RATE_LIMIT },
  schema: body ? { hide: true, body } : { hide: true },
})

const CREATE_TENANT_SCHEMA = {
  type: 'object',
  required: ['id', 'name'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9._-]+$' },
    name: { type: 'string', minLength: 1, maxLength: 256 },
  },
}
const STATUS_SCHEMA = {
  type: 'object',
  required: ['status'],
  additionalProperties: false,
  properties: { status: { type: 'string', enum: ['active', 'disabled'] } },
}

const RETENTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // Override the configured window for this run (ms). Omit to use the default.
  properties: { auditMaxAgeMs: { type: 'integer', minimum: 0 } },
}

export function registerAdminRoutes(
  app: FastifyInstance, tenants: TenantStore, store: OpStore,
  retention: RetentionConfig, metrics?: Metrics, adminAudit?: AdminAuditStore,
): void {
  // Best-effort admin-action audit: record the change but never fail the
  // operation (or leak a token) on an audit-write hiccup.
  const logAdmin = async (req: FastifyRequest, action: AdminAction, tenantId: string | null, detail: unknown) => {
    if (!adminAudit) return
    try { await adminAudit.record({ action, tenantId, detail, actor: req.adminSubject, ip: req.ip }) } catch { /* best-effort */ }
  }

  // Per-tenant operational counters (in-memory, per-instance) — JSON, plus a
  // Prometheus scrape endpoint (admin-gated; point a scraper's bearer_token at it).
  if (metrics) {
    app.get('/admin/metrics', HIDDEN, async () => metrics.snapshot())
    app.get('/admin/metrics/prometheus', HIDDEN, async (_req, reply) => {
      reply.header('content-type', PROMETHEUS_CONTENT_TYPE)
      return renderPrometheus(metrics.snapshot())
    })
  }

  // Read the admin-action audit trail (optionally filtered by ?tenant=).
  if (adminAudit) {
    app.get('/admin/audit', HIDDEN, async (req) => {
      const { tenant, limit } = (req.query ?? {}) as { tenant?: string; limit?: string }
      return { entries: await adminAudit.list({ tenantId: tenant, limit: limit ? Number(limit) : undefined }) }
    })
  }

  // Run audit-log retention: prune observational audit entries older than the
  // window (configured default, or a per-request `auditMaxAgeMs` override)
  // across every tenant. The op-log (source of truth) is never touched. An
  // operator/scheduler hits this periodically; it is idempotent.
  app.post('/admin/retention', opts(RETENTION_SCHEMA), async (req, reply) => {
    const body = (req.body ?? {}) as { auditMaxAgeMs?: number }
    const cfg: RetentionConfig = {
      auditMaxAgeMs: body.auditMaxAgeMs ?? retention.auditMaxAgeMs,
    }
    if (!cfg.auditMaxAgeMs || cfg.auditMaxAgeMs <= 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'No retention window configured; set security.auditRetentionMs or pass auditMaxAgeMs.',
        statusCode: 400,
        requestId: String(req.id),
      })
    }
    const now = Date.now()
    const tenantIds = [DEFAULT_TENANT, ...(await tenants.listTenants()).map((t) => t.id)]
    const prunedByTenant: Record<string, number> = {}
    let total = 0
    for (const id of new Set(tenantIds)) {
      const n = await pruneTenantAudit(store, id, cfg, now)
      prunedByTenant[id] = n
      total += n
    }
    await logAdmin(req, 'retention.run', null, { auditMaxAgeMs: cfg.auditMaxAgeMs, total })
    return { auditMaxAgeMs: cfg.auditMaxAgeMs, total, prunedByTenant }
  })

  // Create a tenant.
  app.post('/admin/tenants', opts(CREATE_TENANT_SCHEMA), async (req, reply) => {
    const { id, name } = req.body as { id: string; name: string }
    try {
      const tenant = await tenants.createTenant(id, name)
      await logAdmin(req, 'tenant.create', id, { name })
      return reply.code(201).send({ tenant })
    } catch (err) {
      return reply.code(409).send({ error: 'conflict', message: (err as Error).message })
    }
  })

  app.get('/admin/tenants', HIDDEN, async () => ({ tenants: await tenants.listTenants() }))

  // Enable / disable a tenant (a disabled tenant's keys stop authenticating).
  app.patch('/admin/tenants/:id', opts(STATUS_SCHEMA), async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: 'active' | 'disabled' }
    if (!(await tenants.setTenantStatus(id, status))) {
      return reply.code(404).send({ error: 'not_found', message: `Tenant '${id}' not found` })
    }
    await logAdmin(req, 'tenant.status', id, { status })
    return { tenant: await tenants.getTenant(id) }
  })

  // Issue a key — the plaintext token is returned ONCE and never stored/shown
  // again. No body schema: the optional label may be omitted entirely (an empty
  // POST), so we read and bound it defensively instead.
  app.post('/admin/tenants/:id/keys', HIDDEN, async (req, reply) => {
    const { id } = req.params as { id: string }
    const raw = (req.body ?? {}) as { label?: unknown }
    const label = typeof raw.label === 'string' ? raw.label.slice(0, 256) : undefined
    if (!(await tenants.getTenant(id))) {
      return reply.code(404).send({ error: 'not_found', message: `Tenant '${id}' not found` })
    }
    const issued = await tenants.issueKey(id, label)
    await logAdmin(req, 'key.issue', id, { keyId: issued.key.id, label: label ?? null }) // never the token
    return reply.code(201).send(issued)
  })

  // List a tenant's keys (hints + metadata only — never the tokens). 404 on an
  // unknown tenant so a typo'd id is distinguishable from a real empty tenant.
  app.get('/admin/tenants/:id/keys', HIDDEN, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await tenants.getTenant(id))) {
      return reply.code(404).send({ error: 'not_found', message: `Tenant '${id}' not found` })
    }
    return { keys: await tenants.listKeys(id) }
  })

  // Revoke a key (rotation = issue a new key, then revoke the old one).
  app.delete('/admin/tenants/:id/keys/:keyId', HIDDEN, async (req, reply) => {
    const { id, keyId } = req.params as { id: string; keyId: string }
    // Guard the id: a non-numeric path segment would otherwise reach a bigint
    // comparison and surface as a 500 instead of a controlled 400.
    const numericKeyId = Number(keyId)
    if (!Number.isInteger(numericKeyId) || numericKeyId <= 0) {
      return reply.code(400).send({ error: 'bad_request', message: 'keyId must be a positive integer' })
    }
    if (!(await tenants.revokeKey(id, numericKeyId))) {
      return reply.code(404).send({ error: 'not_found', message: 'Key not found or already revoked' })
    }
    await logAdmin(req, 'key.revoke', id, { keyId: numericKeyId })
    return { revoked: true }
  })
}
