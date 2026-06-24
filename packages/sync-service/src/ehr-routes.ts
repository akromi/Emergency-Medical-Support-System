// EHR routes — expose the provincial-EHR integration to clients through the
// existing backend. The PWA never talks to Ontario Health directly (it can't
// hold ONE ID secrets or a client cert); it calls these routes, and the
// injected EhrGateway handles auth, mTLS, conformance, and audit.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { EhrError, type EhrGateway, type PatientIdentity, type CasualtyRecord } from '@triage-link/core'
import type { EhrAuditStore } from './ehr-audit-store.js'

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

export function registerEhrRoutes(app: FastifyInstance, ehr: EhrGateway): void {
  // Liveness/auth probe for the configured provider.
  app.get('/ehr/health', async () => ({ provider: ehr.provider, ok: await ehr.ping() }))

  // Resolve a patient against the provincial client registry (Ontario: PCR $match).
  app.post('/ehr/patient/$match', async (req, reply) => {
    const body = req.body
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'invalid-request', message: 'Body must be a PatientIdentity object' })
    }
    try {
      const result = await ehr.matchPatient(body as PatientIdentity)
      return reply.send({ provider: ehr.provider, ...result })
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })

  // Contribute a casualty handover to the EHR (write), where the provider
  // supports it. Restricted in practice to entitled source systems.
  app.post('/ehr/handover', async (req, reply) => {
    if (!ehr.contributeHandover) {
      return reply.code(501).send({ error: 'unsupported', message: `${ehr.provider} does not support handover contribution` })
    }
    const body = req.body
    if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof (body as CasualtyRecord).id !== 'string') {
      return reply.code(400).send({ error: 'invalid-request', message: 'Body must be a CasualtyRecord' })
    }
    try {
      const result = await ehr.contributeHandover(body as CasualtyRecord)
      return reply.send({ provider: ehr.provider, ...result })
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })

  // Pull clinical context (meds/allergies/labs) for a resolved patient, where
  // the configured provider supports it (Ontario: DHDR / OLIS / Patient Summary).
  app.get('/ehr/patient/:id/context', async (req, reply) => {
    if (!ehr.fetchContext) {
      return reply.code(501).send({ error: 'unsupported', message: `${ehr.provider} does not support context fetch` })
    }
    const { id } = req.params as { id: string }
    try {
      const bundle = await ehr.fetchContext(id)
      return reply.send(bundle)
    } catch (err) {
      return handleEhrError(err, reply, req)
    }
  })
}

/** Read access to the EHR audit trail (admin/oversight). */
export function registerEhrAuditRoute(app: FastifyInstance, audit: EhrAuditStore): void {
  app.get('/ehr/audit', async (req) => {
    const { patient, limit } = (req.query ?? {}) as { patient?: string; limit?: string }
    const entries = await audit.list({
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
