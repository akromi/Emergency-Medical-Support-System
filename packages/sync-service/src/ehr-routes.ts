// EHR routes — expose the provincial-EHR integration to clients through the
// existing backend. The PWA never talks to Ontario Health directly (it can't
// hold ONE ID secrets or a client cert); it calls these routes, and the
// injected EhrGateway handles auth, mTLS, conformance, and audit.

import type { FastifyInstance } from 'fastify'
import { EhrError, type EhrGateway, type PatientIdentity } from '@triage-link/core'

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
    const query = (req.body ?? {}) as PatientIdentity
    try {
      const result = await ehr.matchPatient(query)
      return reply.send({ provider: ehr.provider, ...result })
    } catch (err) {
      if (err instanceof EhrError) {
        return reply.code(statusForCode(err.code)).send({ error: err.code, message: err.message, retryable: err.retryable })
      }
      req.log.error(err)
      return reply.code(500).send({ error: 'unknown', message: 'Unexpected EHR error' })
    }
  })
}
