// Tenant-administration API: provision tenants and issue / rotate / revoke
// their API keys at runtime. Gated by the admin token (see app.ts) and hidden
// from the public OpenAPI doc — this is an operational surface, not a client API.
import type { FastifyInstance } from 'fastify'
import type { TenantStore } from './tenant-store.js'

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

export function registerAdminRoutes(app: FastifyInstance, tenants: TenantStore): void {
  // Create a tenant.
  app.post('/admin/tenants', opts(CREATE_TENANT_SCHEMA), async (req, reply) => {
    const { id, name } = req.body as { id: string; name: string }
    try {
      return reply.code(201).send({ tenant: await tenants.createTenant(id, name) })
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
    return reply.code(201).send(await tenants.issueKey(id, label))
  })

  // List a tenant's keys (hints + metadata only — never the tokens).
  app.get('/admin/tenants/:id/keys', HIDDEN, async (req) => {
    const { id } = req.params as { id: string }
    return { keys: await tenants.listKeys(id) }
  })

  // Revoke a key (rotation = issue a new key, then revoke the old one).
  app.delete('/admin/tenants/:id/keys/:keyId', HIDDEN, async (req, reply) => {
    const { id, keyId } = req.params as { id: string; keyId: string }
    if (!(await tenants.revokeKey(id, Number(keyId)))) {
      return reply.code(404).send({ error: 'not_found', message: 'Key not found or already revoked' })
    }
    return { revoked: true }
  })
}
