// Shared OpenAPI / serialization schemas, kept dependency-free so both app.ts
// and the route modules (ehr-routes.ts, admin-routes.ts) can import them without
// an import cycle.
//
// Every schema uses additionalProperties:true so declaring it as a route
// `response` documents the known shape WITHOUT fast-json-stringify stripping any
// dynamic or route-specific fields (record snapshots, FHIR bundles, an EHR
// error's `retryable`, etc.).

/** The sanitized error envelope (see app.ts setErrorHandler). Route handlers
 *  that send their own 4xx bodies (auth gate, EHR errors) are a superset of
 *  this — additionalProperties:true lets those extra fields through. */
export const ERROR_RESPONSE_SCHEMA = {
  type: 'object',
  description: 'Error envelope. On a 5xx the message is generic — the real cause stays server-side, correlatable by requestId. Some routes add fields (e.g. an EHR error\'s `retryable`).',
  properties: {
    error: { type: 'string', description: 'Short error code / HTTP reason phrase.' },
    message: { type: 'string' },
    statusCode: { type: 'integer' },
    requestId: { type: 'string', description: 'Correlation id (also echoed as the x-request-id header).' },
  },
  additionalProperties: true,
} as const

/** A permissive object whose inner shape is dynamic (e.g. a record snapshot, a
 *  FHIR bundle) — documented as an object, contents passed through untouched. */
export const OPAQUE_OBJECT_SCHEMA = { type: 'object', additionalProperties: true } as const
export const OPAQUE_ARRAY_SCHEMA = { type: 'array', items: { type: 'object', additionalProperties: true } } as const
