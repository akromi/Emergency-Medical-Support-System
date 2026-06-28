// EHR routes — expose the provincial-EHR integration to clients through the
// existing backend. The PWA never talks to Ontario Health directly (it can't
// hold ONE ID secrets or a client cert); it calls these routes, and the
// injected EhrGateway handles auth, mTLS, conformance, and audit.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { EhrError, type EhrGateway, type PatientIdentity, type CasualtyRecord } from '@triage-link/core'
import type { EhrAuditStore } from './ehr-audit-store.js'
import { runWithTenant } from './tenant-context.js'
import { ERROR_RESPONSE_SCHEMA, OPAQUE_OBJECT_SCHEMA, OPAQUE_ARRAY_SCHEMA } from './schemas.js'

// Build a `response` map: a 200 success schema plus the error envelope for each
// listed status code (all permissive, so no field is stripped on serialization).
const withErrors = (success: object, ...codes: number[]): Record<string, object> => ({
  200: success,
  ...Object.fromEntries(codes.map((c) => [String(c), ERROR_RESPONSE_SCHEMA])),
})

const EHR_HEALTH_RESPONSE = {
  type: 'object',
  properties: { provider: { type: 'string' }, ok: { type: 'boolean' } },
  additionalProperties: true,
}
const EHR_MATCH_RESPONSE = {
  type: 'object',
  description: 'Provider name plus the registry match result.',
  properties: { provider: { type: 'string' }, resolved: { type: 'boolean' } },
  additionalProperties: true,
}
const EHR_HANDOVER_RESPONSE = {
  type: 'object',
  description: 'Provider name plus the contribution outcome.',
  properties: { provider: { type: 'string' }, accepted: { type: 'boolean' } },
  additionalProperties: true,
}
const EHR_AUDIT_RESPONSE = {
  type: 'object',
  properties: { entries: OPAQUE_ARRAY_SCHEMA },
  additionalProperties: true,
}

function statusForCode(code: EhrError['code']): number {
  switch (code) {
    case 'unauthorized':
      return 401
    case 'forbidden':
      return 403
    case 'not-found':
      return 404
    case 'invalid-request':
      return 400
    case 'rate-limited':
      return 429
    case 'unavailable':
    case 'transport':
      return 503
    default:
      return 502
  }
}

// ---- OpenAPI schemas (drive Swagger UI "Try it out" + request models) ----
const patientIdentitySchema = {
  type: 'object',
  properties: {
    healthCardNumber: { type: 'string', description: 'OHIP health-card number' },
    healthCardVersion: { type: 'string' },
    givenName: { type: 'string' },
    familyName: { type: 'string' },
    birthDate: { type: 'string', description: 'ISO-8601 date (YYYY-MM-DD)' },
    gender: { type: 'string', enum: ['female', 'male', 'other', 'unknown'] },
  },
  examples: [{ healthCardNumber: '1234567890' }],
}

export function registerEhrRoutes(app: FastifyInstance, ehr: EhrGateway): void {
  // Liveness/auth probe for the configured provider.
  app.get(
    '/ehr/health',
    { schema: { tags: ['ehr'], summary: 'Gateway liveness + provider name', response: withErrors(EHR_HEALTH_RESPONSE, 401) } },
    async () => ({ provider: ehr.provider, ok: await ehr.ping() }),
  )

  // Resolve a patient against the provincial client registry (Ontario: PCR $match).
  app.post('/ehr/patient/$match', {
    // Schema documents the route (Swagger models) but the handler keeps
    // ownership of validation + error shape, so attachValidation defers to it.
    attachValidation: true,
    schema: {
      tags: ['ehr'],
      summary: 'Resolve a patient (PCR $match)',
      description: 'Match a patient against the provincial client registry. Try { "healthCardNumber": "1234567890" } against the mock.',
      body: patientIdentitySchema,
      response: withErrors(EHR_MATCH_RESPONSE, 400, 401, 403, 404, 429, 502, 503),
    },
  }, async (req, reply) => {
    const body = req.body
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'invalid-request', message: 'Body must be a PatientIdentity object' })
    }
    try {
      // Run inside the tenant context so the gateway's onAudit writes the EHR
      // audit row under this request's tenant.
      const result = await runWithTenant(req.tenantId, () => ehr.matchPatient(body as PatientIdentity))
      return reply.send({ provider: ehr.provider, ...result })
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })

  // Contribute a casualty handover to the EHR (write), where the provider
  // supports it. Restricted in practice to entitled source systems.
  app.post('/ehr/handover', {
    attachValidation: true,
    schema: {
      tags: ['ehr'],
      summary: 'Contribute a casualty handover (Send to EHR)',
      description: 'POST a CasualtyRecord (must have an "id"). Against the mock this returns { accepted, id: "mock-tx-<id>" }.',
      body: { type: 'object', required: ['id'], properties: { id: { type: 'string' } }, additionalProperties: true, examples: [{ id: 'CAS-9', tombstone: { name: 'Doe, Jane' } }] },
      response: withErrors(EHR_HANDOVER_RESPONSE, 400, 401, 403, 404, 429, 501, 502, 503),
    },
  }, async (req, reply) => {
    if (!ehr.contributeHandover) {
      return reply.code(501).send({ error: 'unsupported', message: `${ehr.provider} does not support handover contribution` })
    }
    const body = req.body
    if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof (body as CasualtyRecord).id !== 'string') {
      return reply.code(400).send({ error: 'invalid-request', message: 'Body must be a CasualtyRecord' })
    }
    try {
      const result = await runWithTenant(req.tenantId, () => ehr.contributeHandover!(body as CasualtyRecord))
      return reply.send({ provider: ehr.provider, ...result })
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })

  // Pull clinical context (meds/allergies/labs) for a resolved patient, where
  // the configured provider supports it (Ontario: DHDR / OLIS / Patient Summary).
  app.get('/ehr/patient/:id/context', {
    schema: {
      tags: ['ehr'],
      summary: 'Pull clinical context for a resolved patient',
      description: 'Returns a FHIR Bundle (meds/allergies/labs). Try id "pcr-1001" against the mock.',
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: withErrors(OPAQUE_OBJECT_SCHEMA, 401, 403, 404, 429, 501, 502, 503),
    },
  }, async (req, reply) => {
    if (!ehr.fetchContext) {
      return reply.code(501).send({ error: 'unsupported', message: `${ehr.provider} does not support context fetch` })
    }
    const { id } = req.params as { id: string }
    try {
      const bundle = await runWithTenant(req.tenantId, () => ehr.fetchContext!(id))
      return reply.send(bundle)
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })
}

/** Read access to the EHR audit trail (admin/oversight). */
export function registerEhrAuditRoute(app: FastifyInstance, audit: EhrAuditStore): void {
  app.get('/ehr/audit', {
    schema: {
      tags: ['ehr'],
      summary: 'Read the EHR access audit trail',
      querystring: { type: 'object', properties: { patient: { type: 'string' }, limit: { type: 'string' } } },
      response: withErrors(EHR_AUDIT_RESPONSE, 401),
    },
  }, async (req) => {
    const { patient, limit } = (req.query ?? {}) as { patient?: string; limit?: string }
    // Scoped to the caller's tenant — one org never reads another's EHR trail.
    const entries = await audit.list({
      tenantId: req.tenantId,
      patientRef: patient,
      limit: limit ? Number(limit) : undefined,
    })
    return { entries }
  })
}

function handleEhrError(err: unknown, reply: FastifyReply, req: FastifyRequest) {
  if (err instanceof EhrError) {
    return reply.code(statusForCode(err.code)).send({ error: err.code, message: err.message, retryable: err.retryable })
  }
  req.log.error(err)
  return reply.code(500).send({ error: 'unknown', message: 'Unexpected EHR error' })
}
