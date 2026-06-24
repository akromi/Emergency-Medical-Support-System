// Ontario Health adapter — implements the core EhrGateway port against the
// ONE Access Gateway (provider gateway fronting Ontario's provincial EHR).
//
// Today it implements the Provincial Client Registry (PCR) Patient/$match
// query, which is the highest-value, most-feasible integration for a field
// handover tool: confirm/resolve a casualty's identity by health-card number.
// fetchContext (DHDR/OLIS/Patient Summary) is left as a typed extension point.
//
// Every access emits an ATNA AuditEvent through the injected sink, as required
// by Ontario Health's privacy & security policy.

import {
  EhrError,
  buildPatientMatchParameters,
  parsePatientMatchBundle,
  buildAccessAuditEvent,
  type EhrGateway,
  type PatientIdentity,
  type MatchResult,
  type FhirResource,
} from '@triage-link/core'
import { HttpClient, type FetchLike } from './http.js'
import { OneIdClient } from './one-id.js'

export interface OntarioHealthGatewayConfig {
  /** ONE Access Gateway FHIR base URL (e.g. https://.../fhir/r4). */
  fhirBaseUrl: string
  /** ONE ID client used to mint bearer tokens. */
  oneId: OneIdClient
  /** Identifier of the requesting clinician (ONE ID subject) — for the audit trail. */
  requestingAgentId: string
  /** Sink for AuditEvents; default is a no-op (prefer wiring to a real store). */
  onAudit?: (event: FhirResource) => void | Promise<void>
  /** Only return certain matches from PCR (default true — safest for identity). */
  onlyCertainMatches?: boolean
  fetchImpl?: FetchLike
  /** undici Dispatcher carrying the mTLS client certificate. */
  dispatcher?: unknown
  /** Injected clock for deterministic audit timestamps. */
  now?: () => number
}

export class OntarioHealthGateway implements EhrGateway {
  readonly provider = 'ontario-health'
  private readonly http: HttpClient
  private readonly cfg: OntarioHealthGatewayConfig
  private readonly now: () => number

  constructor(cfg: OntarioHealthGatewayConfig) {
    this.cfg = cfg
    this.now = cfg.now ?? (() => Date.now())
    this.http = new HttpClient({ baseUrl: cfg.fhirBaseUrl, fetchImpl: cfg.fetchImpl, dispatcher: cfg.dispatcher })
  }

  async ping(): Promise<boolean> {
    try {
      // CapabilityStatement is unauthenticated-friendly and cheap.
      await this.authedRequest('/metadata', { method: 'GET' })
      return true
    } catch {
      return false
    }
  }

  async matchPatient(query: PatientIdentity): Promise<MatchResult> {
    if (!query.healthCardNumber && !(query.familyName && query.birthDate)) {
      throw new EhrError('invalid-request', 'PCR $match needs a health-card number, or a family name with birth date')
    }

    const params = buildPatientMatchParameters(query, {
      onlyCertainMatches: this.cfg.onlyCertainMatches ?? true,
    })

    let outcome: '0' | '8' = '0'
    let result: MatchResult = { matches: [], resolved: false }
    try {
      const bundle = await this.authedRequest<unknown>('/Patient/$match', {
        method: 'POST',
        headers: { 'content-type': 'application/fhir+json', accept: 'application/fhir+json' },
        body: JSON.stringify(params),
      })
      result = parsePatientMatchBundle(bundle)
      return result
    } catch (err) {
      outcome = '8'
      throw err
    } finally {
      await this.audit({
        action: 'R',
        outcome,
        query: query.healthCardNumber ? 'Patient/$match by HCN' : 'Patient/$match by demographics',
        patientId: result.resolved ? result.matches[0]?.id : undefined,
      })
    }
  }

  /** Authenticated request with a single transparent retry on a stale token. */
  private async authedRequest<T>(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<T> {
    const send = async () => {
      const token = await this.cfg.oneId.getAccessToken()
      return this.http.request<T>(path, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${token}` },
      })
    }
    try {
      return await send()
    } catch (err) {
      if (err instanceof EhrError && err.code === 'unauthorized') {
        this.cfg.oneId.invalidate()
        return send()
      }
      throw err
    }
  }

  private async audit(params: { action: 'R'; outcome: '0' | '8'; query: string; patientId?: string }): Promise<void> {
    if (!this.cfg.onAudit) return
    const event = buildAccessAuditEvent({
      action: params.action,
      outcome: params.outcome,
      recordedIso: new Date(this.now()).toISOString(),
      agentId: this.cfg.requestingAgentId,
      query: params.query,
      patientId: params.patientId,
    })
    await this.cfg.onAudit(event)
  }
}
