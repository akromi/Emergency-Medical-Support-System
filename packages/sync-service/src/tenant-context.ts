import { AsyncLocalStorage } from 'node:async_hooks'

// Carries the request's tenant through to code that runs during an EHR gateway
// call but has no request in scope — notably the gateway's onAudit callback,
// which writes the EHR audit trail. The EHR route handlers run the gateway call
// inside runWithTenant(req.tenantId, …); the audit sink reads currentTenant().
const store = new AsyncLocalStorage<string>()

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return store.run(tenantId, fn)
}

/** The tenant of the in-flight request, or undefined outside any request. */
export function currentTenant(): string | undefined {
  return store.getStore()
}
