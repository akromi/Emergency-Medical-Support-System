// @triage-link/ehr-gateway — provincial EHR adapters behind core's EhrGateway port.
//
// Ontario Health (ONE Access Gateway / PCR) is the first concrete provider; the
// MockGateway backs local dev and tests. Add a new province by implementing the
// same EhrGateway interface — nothing upstream changes.
export { HttpClient, type FetchLike, type ResponseLike, type RequestInitLike, type HttpClientOptions } from './http.js'
export { OneIdClient, type OneIdConfig } from './one-id.js'
export { createMtlsDispatcher, mtlsDispatcherFromFiles, mtlsDispatcherFromEnv, type MtlsOptions } from './mtls.js'
export { OntarioHealthGateway, type OntarioHealthGatewayConfig } from './ontario-health-gateway.js'
export { MockGateway, type MockPatient } from './mock-gateway.js'
