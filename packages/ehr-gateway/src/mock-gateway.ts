// In-memory EhrGateway for local dev, demos, and tests.
//
// Lets you build and exercise the whole integration path — routes, UI, audit —
// without ONE ID credentials or a sandbox connection. Seed it with patients and
// it answers $match queries with FHIR-shaped match grades, just like PCR.

import {
  parsePatientMatchBundle,
  ONTARIO_SYSTEMS,
  type EhrGateway,
  type PatientIdentity,
  type MatchResult,
} from '@triage-link/core'

export interface MockPatient {
  id: string
  healthCardNumber?: string
  givenName?: string
  familyName?: string
  birthDate?: string
  gender?: string
}

/** A deliberately tiny matcher: exact HCN → certain, else name+dob → probable. */
function grade(patient: MockPatient, query: PatientIdentity): number {
  if (query.healthCardNumber && patient.healthCardNumber === query.healthCardNumber) return 0.99
  const nameMatches =
    !!query.familyName &&
    patient.familyName?.toLowerCase() === query.familyName.toLowerCase() &&
    (!query.givenName || patient.givenName?.toLowerCase() === query.givenName.toLowerCase())
  if (nameMatches && query.birthDate && patient.birthDate === query.birthDate) return 0.8
  if (nameMatches) return 0.4
  return 0
}

export class MockGateway implements EhrGateway {
  readonly provider = 'mock'
  private readonly patients: MockPatient[]

  constructor(patients: MockPatient[] = DEFAULT_SEED) {
    this.patients = patients
  }

  async ping(): Promise<boolean> {
    return true
  }

  async matchPatient(query: PatientIdentity): Promise<MatchResult> {
    const entry = this.patients
      .map((p) => ({ p, score: grade(p, query) }))
      .filter(({ score }) => score > 0)
      .map(({ p, score }) => ({
        resource: {
          resourceType: 'Patient',
          id: p.id,
          identifier: p.healthCardNumber ? [{ system: ONTARIO_SYSTEMS.healthCard, value: p.healthCardNumber }] : [],
          name: [{ family: p.familyName, given: p.givenName ? [p.givenName] : undefined }],
          birthDate: p.birthDate,
          gender: p.gender,
        },
        search: { mode: 'match', score },
      }))
    // Round-trip through the same parser the real adapter uses, so behaviour
    // (sorting, resolved flag) is identical to production.
    return parsePatientMatchBundle({ resourceType: 'Bundle', type: 'searchset', entry })
  }
}

const DEFAULT_SEED: MockPatient[] = [
  { id: 'pcr-1001', healthCardNumber: '1234567890', givenName: 'Jane', familyName: 'Doe', birthDate: '1990-04-01', gender: 'female' },
  { id: 'pcr-1002', healthCardNumber: '9876543210', givenName: 'John', familyName: 'Roe', birthDate: '1985-11-23', gender: 'male' },
]
