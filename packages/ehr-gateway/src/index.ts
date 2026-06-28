// @triage-link/ehr-gateway — provincial EHR adapters behind core's EhrGateway port.
//
// Ontario Health (ONE Access Gateway / PCR) is the first concrete provider; the
// MockGateway backs local dev and tests. Add a new province by implementing the
// same EhrGateway interface — nothing upstream changes.
export { HttpClient, type FetchLike, type ResponseLike, type RequestInitLike, type HttpClientOptions } from './http.js'
export { OneIdClient, type OneIdConfig } from './one-id.js'
export { OntarioHealthGateway, type OntarioHealthGatewayConfig } from './ontario-health-gateway.js'
export { MockGateway, type MockPatient } from './mock-gateway.js'

// NOTE: the mTLS transport (`./mtls.js`) is intentionally NOT re-exported here.
// It imports `undici`, a Node-only HTTP library that touches `process`/`node:*`
// builtins at module load. This barrel is reachable from the browser PWA (which
// imports `MockGateway`), so re-exporting mtls dragged undici into the client
// bundle and crashed the app on load with "process is not defined". Server-side
// consumers import the mTLS helpers directly from '@triage-link/ehr-gateway/src/mtls.js'.
