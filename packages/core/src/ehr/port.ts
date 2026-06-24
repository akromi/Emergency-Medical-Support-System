// Provider-agnostic Electronic Health Record gateway port.
//
// TRIAGE-LINK does not couple to any one province's EHR. This interface is the
// seam: the PWA / sync-service depend only on `EhrGateway`, and a concrete
// adapter (e.g. Ontario Health's ONE Access Gateway) implements it. Swapping
// provinces — or running against a mock in dev — is a one-line wiring change.
//
// Framework-free on purpose: no fetch, no Fastify, no secrets here. Transport
// and auth live in the adapter package (@triage-link/ehr-gateway).

import type { Tombstone, CasualtyRecord } from '../domain/types.js'

/** Demographics used to look a patient up in a provincial client registry. */
export interface PatientIdentity {
  /** Provincial health-card number (e.g. Ontario OHIP number). */
  healthCardNumber?: string
  /** Health-card version code, where the province issues one. */
  healthCardVersion?: string
  givenName?: string
  familyName?: string
  /** ISO-8601 date (YYYY-MM-DD). */
  birthDate?: string
  gender?: 'female' | 'male' | 'other' | 'unknown'
}

/** A single candidate returned by a registry patient-match query. */
export interface PatientMatch {
  /** Registry-assigned logical id for the matched Patient resource. */
  id: string
  /** All identifiers the registry holds for this patient (system + value). */
  identifiers: Array<{ system: string; value: string }>
  givenName?: string
  familyName?: string
  birthDate?: string
  gender?: string
  /**
   * Match confidence the registry attached to this candidate, normalised to
   * 0..1 where known. PCR returns FHIR match grades (certain/probable/...);
   * the adapter maps those onto this scale.
   */
  score?: number
  /** Raw match grade as reported by the source system, when present. */
  grade?: 'certain' | 'probable' | 'possible' | 'certainly-not'
}

export interface MatchResult {
  matches: PatientMatch[]
  /** True when the registry signalled exactly one certain match. */
  resolved: boolean
}

/** Stable, machine-readable failure categories an adapter can surface. */
export type EhrErrorCode =
  | 'unauthorized' // token rejected / expired / insufficient scope
  | 'forbidden' // authenticated but not permitted (consent / role)
  | 'not-found'
  | 'invalid-request' // failed provincial conformance / bad query
  | 'rate-limited'
  | 'unavailable' // gateway / upstream repository down
  | 'transport' // network, TLS, timeout
  | 'unknown'

/** Error every adapter throws so callers can branch without string-matching. */
export class EhrError extends Error {
  readonly code: EhrErrorCode
  /** Upstream HTTP status, when the failure came from an HTTP response. */
  readonly status?: number
  /** Whether retrying the same request could plausibly succeed. */
  readonly retryable: boolean
  /** Underlying error, when this wraps a lower-level failure. */
  readonly cause?: unknown

  constructor(
    code: EhrErrorCode,
    message: string,
    opts: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'EhrError'
    this.code = code
    this.status = opts.status
    this.cause = opts.cause
    this.retryable = opts.retryable ?? (code === 'rate-limited' || code === 'unavailable' || code === 'transport')
  }
}

/**
 * The integration contract. Ontario's interface is overwhelmingly read/query,
 * so the required surface is small and read-only; richer context fetches are
 * optional capabilities an adapter may or may not implement.
 */
export interface EhrGateway {
  /** Human/diagnostic name of the backing provider (e.g. "ontario-health"). */
  readonly provider: string

  /** Liveness/auth probe — resolves false (never throws) when unreachable. */
  ping(): Promise<boolean>

  /**
   * Resolve a patient against the provincial client registry.
   * Ontario: Patient/$match against the PCR.
   */
  matchPatient(query: PatientIdentity): Promise<MatchResult>

  /**
   * Optional: pull clinical context (meds, labs, summary) for a known patient.
   * Returns a FHIR Bundle. Undefined on adapters that don't support it.
   */
  fetchContext?(patientId: string): Promise<unknown>

  /**
   * Optional (write): contribute a casualty handover to the provincial EHR.
   * Restricted in practice — only entitled source systems may write. Undefined
   * on adapters that don't support contribution.
   */
  contributeHandover?(record: CasualtyRecord): Promise<ContributionResult>
}

/** Outcome of a handover contribution. */
export interface ContributionResult {
  accepted: boolean
  /** Server-assigned id / transaction reference, when returned. */
  id?: string
  /** Raw OperationOutcome / response, for diagnostics. */
  outcome?: unknown
}

/** Build a registry query straight from a casualty record's tombstone. */
export function identityFromTombstone(t: Tombstone): PatientIdentity {
  const query: PatientIdentity = {}
  // The tombstone MRN doubles as the captured health-card number in the field.
  if (t.mrn) query.healthCardNumber = t.mrn
  if (t.dob) query.birthDate = t.dob
  if (t.sex === 'female' || t.sex === 'male' || t.sex === 'other' || t.sex === 'unknown') {
    query.gender = t.sex
  }
  // Tombstone stores a single free-text name; split "Family, Given" if present.
  if (t.name) {
    const [family, given] = t.name.split(',').map((s) => s.trim())
    if (family) query.familyName = family
    if (given) query.givenName = given
  }
  return query
}
