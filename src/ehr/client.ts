// Browser-side client for the provincial EHR routes exposed by sync-service.
//
// The PWA never calls Ontario Health directly (no secrets / client cert in a
// browser). It calls our backend, which holds the EhrGateway. The backend base
// URL is configured at build time via VITE_EHR_BASE_URL (empty = same origin).
import type { MatchResult, PatientIdentity, FhirBundle, CasualtyRecord, ContributionResult } from '@triage-link/core'

const BASE_URL = (import.meta.env.VITE_EHR_BASE_URL ?? '').replace(/\/+$/, '')

export class EhrUnavailableError extends Error {}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // No backend reachable (offline, or sync-service not running).
    throw new EhrUnavailableError('EHR service is not reachable')
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { message?: string }).message ?? `EHR request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Resolve a patient against the provincial client registry (PCR $match). */
export function matchPatient(query: PatientIdentity): Promise<MatchResult & { provider: string }> {
  return postJson('/ehr/patient/$match', query)
}

/** Contribute a casualty handover to the EHR (write). */
export function contributeHandover(record: CasualtyRecord): Promise<ContributionResult & { provider: string }> {
  return postJson('/ehr/handover', record)
}

/** Pull clinical context (meds/allergies/labs) for a resolved patient. */
export async function fetchContext(patientId: string): Promise<FhirBundle> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/ehr/patient/${encodeURIComponent(patientId)}/context`)
  } catch {
    throw new EhrUnavailableError('EHR service is not reachable')
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error((detail as { message?: string }).message ?? `Context fetch failed (${res.status})`)
  }
  return res.json() as Promise<FhirBundle>
}
