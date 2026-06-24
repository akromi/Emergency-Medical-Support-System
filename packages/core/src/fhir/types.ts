// Minimal FHIR R4 shapes for the resources this system emits.
// Loosely typed on purpose to avoid a heavy dependency.
export interface FhirResource {
  resourceType: string
  [key: string]: unknown
}

export interface FhirBundleEntry {
  fullUrl?: string
  resource: FhirResource
  /** Present on transaction/batch bundles — how the server should apply the entry. */
  request?: { method: 'POST' | 'PUT' | 'GET' | 'DELETE'; url: string }
}

export type FhirBundleType = 'collection' | 'transaction' | 'searchset'

export interface FhirBundle {
  resourceType: 'Bundle'
  type: FhirBundleType
  timestamp: string
  entry: FhirBundleEntry[]
}
