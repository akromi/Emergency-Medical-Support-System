// @triage-link/core — framework-free domain model + HL7 FHIR R4 mapping.
// Shared source of truth: consumable by the PWA, a future React Native client,
// or a backend sync service without any React/Dexie dependency.
export * from './domain/types.js'
export * from './domain/injuries.js'
export * from './domain/regions.js'
export * from './domain/id.js'
export * from './fhir/types.js'
export * from './fhir/mapping.js'
export * from './sync/types.js'
export * from './sync/oplog.js'
