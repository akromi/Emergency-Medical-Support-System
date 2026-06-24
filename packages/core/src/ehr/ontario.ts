// Ontario Health–specific FHIR R4 shapes for the provincial EHR.
//
// These are the conformance details that differ from the generic hospital-
// handover bundle in ../fhir/mapping.ts: Ontario uses specific identifier
// systems (OHIP health card), drives patient lookups through a FHIR
// Patient/$match operation against the Provincial Client Registry (PCR), and
// requires an ATNA AuditEvent for every access.
//
// Framework-free: this module only builds/parses plain FHIR JSON objects. The
// adapter package owns transport, ONE ID auth, and mTLS.
//
// References:
//   PCR FHIR Implementation Guide — ehealthontario.on.ca
//   ONE Access Gateway Transport Specification — ehealthontario.on.ca

import type { FhirResource } from '../fhir/types.js'
import type { PatientIdentity, PatientMatch, MatchResult } from './port.js'

/**
 * Canonical identifier systems used by Ontario Health.
 *
 * NOTE: the precise canonical URLs are fixed by the version of the PCR
 * implementation guide you onboard against — confirm them against the IG /
 * conformance package before going live. They are centralised here so there is
 * a single place to update.
 */
export const ONTARIO_SYSTEMS = {
  /** OHIP health card number. */
  healthCard: 'https://fhir.infoway-inforoute.ca/NamingSystem/ca-on-patient-hcn',
  /** Health card version code. */
  healthCardVersion: 'https://fhir.infoway-inforoute.ca/NamingSystem/ca-on-patient-hcn-version',
} as const

/** FHIR match grades the PCR may attach to a candidate, and a 0..1 score. */
const GRADE_SCORE: Record<NonNullable<PatientMatch['grade']>, number> = {
  certain: 1,
  probable: 0.75,
  possible: 0.4,
  'certainly-not': 0,
}

/**
 * Build the FHIR `Parameters` body for a PCR `Patient/$match` request.
 *
 * $match takes a (partial) Patient resource plus matching controls and returns
 * a searchset Bundle of candidates graded by confidence.
 */
export function buildPatientMatchParameters(
  query: PatientIdentity,
  opts: { onlyCertainMatches?: boolean; count?: number } = {},
): FhirResource {
  const patient: FhirResource = { resourceType: 'Patient' }

  const identifier: Array<Record<string, unknown>> = []
  if (query.healthCardNumber) {
    identifier.push({ system: ONTARIO_SYSTEMS.healthCard, value: query.healthCardNumber })
  }
  if (query.healthCardVersion) {
    identifier.push({ system: ONTARIO_SYSTEMS.healthCardVersion, value: query.healthCardVersion })
  }
  if (identifier.length) patient.identifier = identifier

  if (query.familyName || query.givenName) {
    patient.name = [
      {
        family: query.familyName,
        given: query.givenName ? [query.givenName] : undefined,
      },
    ]
  }
  if (query.birthDate) patient.birthDate = query.birthDate
  if (query.gender) patient.gender = query.gender

  const parameter: Array<Record<string, unknown>> = [{ name: 'resource', resource: patient }]
  if (opts.onlyCertainMatches !== undefined) {
    parameter.push({ name: 'onlyCertainMatches', valueBoolean: opts.onlyCertainMatches })
  }
  if (opts.count !== undefined) {
    parameter.push({ name: 'count', valueInteger: opts.count })
  }

  return { resourceType: 'Parameters', parameter }
}

interface Bundleish {
  resourceType?: string
  entry?: Array<{ resource?: Record<string, unknown>; search?: { mode?: string; score?: number } }>
}

function gradeFromScore(score?: number): PatientMatch['grade'] {
  if (score === undefined) return undefined
  if (score >= 0.95) return 'certain'
  if (score >= 0.6) return 'probable'
  if (score > 0) return 'possible'
  return 'certainly-not'
}

/**
 * Parse a PCR `$match` searchset Bundle into provider-agnostic matches.
 *
 * Tolerant of FHIR's optionality: a candidate with no search.score still comes
 * back (without a score) rather than being dropped.
 */
export function parsePatientMatchBundle(bundle: unknown): MatchResult {
  const b = (bundle ?? {}) as Bundleish
  const entries = Array.isArray(b.entry) ? b.entry : []
  const matches: PatientMatch[] = []

  for (const entry of entries) {
    const res = entry.resource
    if (!res || res.resourceType !== 'Patient') continue

    const score = entry.search?.score
    const ids = Array.isArray(res.identifier) ? (res.identifier as Array<Record<string, unknown>>) : []
    const name = Array.isArray(res.name) ? (res.name[0] as Record<string, unknown> | undefined) : undefined
    const given = name && Array.isArray(name.given) ? (name.given as unknown[])[0] : undefined

    matches.push({
      id: typeof res.id === 'string' ? res.id : '',
      identifiers: ids
        .filter((i) => typeof i.system === 'string' && typeof i.value === 'string')
        .map((i) => ({ system: i.system as string, value: i.value as string })),
      givenName: typeof given === 'string' ? given : undefined,
      familyName: name && typeof name.family === 'string' ? name.family : undefined,
      birthDate: typeof res.birthDate === 'string' ? res.birthDate : undefined,
      gender: typeof res.gender === 'string' ? res.gender : undefined,
      score: typeof score === 'number' ? score : undefined,
      grade: gradeFromScore(typeof score === 'number' ? score : undefined),
    })
  }

  matches.sort((a, b2) => (b2.score ?? 0) - (a.score ?? 0))

  const certain = matches.filter((m) => (m.score ?? GRADE_SCORE[m.grade ?? 'certainly-not']) >= 0.95)
  return { matches, resolved: certain.length === 1 }
}

/**
 * Build a minimal ATNA AuditEvent for an EHR access. Ontario Health's privacy
 * & security requirements mandate auditing every query against the EHR; the
 * adapter persists/forwards this alongside the call.
 */
export function buildAccessAuditEvent(params: {
  action: 'C' | 'R' | 'U' | 'D' | 'E'
  outcome: '0' | '4' | '8' | '12' // success / minor / serious / major failure
  recordedIso: string
  agentId: string // requesting clinician / ONE ID subject
  query: string // what was asked (e.g. "Patient/$match by HCN")
  patientId?: string
}): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: { system: 'http://terminology.hl7.org/CodeSystem/audit-event-type', code: 'rest', display: 'RESTful Operation' },
    action: params.action,
    recorded: params.recordedIso,
    outcome: params.outcome,
    agent: [
      {
        who: { identifier: { value: params.agentId } },
        requestor: true,
      },
    ],
    source: { observer: { display: 'TRIAGE-LINK' } },
    entity: [
      {
        what: params.patientId ? { reference: `Patient/${params.patientId}` } : undefined,
        detail: [{ type: 'query', valueString: params.query }],
      },
    ],
  }
}
