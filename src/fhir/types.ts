// Minimal FHIR R4 shapes for the resources this system emits.
// Loosely typed on purpose to avoid a heavy dependency.
export interface FhirResource {
  resourceType: string
  [key: string]: unknown
}

export interface FhirBundleEntry {
  fullUrl?: string
  resource: FhirResource
}

export interface FhirBundle {
  resourceType: 'Bundle'
  type: 'collection'
  timestamp: string
  entry: FhirBundleEntry[]
}
