// Per-tenant operational counters. In-memory and per-instance (a horizontally
// scaled deployment scrapes each instance and sums), exposed at /admin/metrics.
// This is observability, not billing: counters are best-effort and reset on
// restart.

export interface TenantMetrics {
  /** POST /sync calls. */
  syncRequests: number
  /** Ops actually ingested (new, non-duplicate). */
  opsIngested: number
  /** Conflicts the resolver recorded. */
  conflicts: number
  /** Responses bucketed by status class. */
  responses: { '2xx': number; '4xx': number; '5xx': number }
}

/** A structured access-log line (method, path, tenant, status, latency). */
export interface AccessLogEntry {
  method: string
  path: string
  tenant: string
  status: number
  ms: number
}

function blank(): TenantMetrics {
  return { syncRequests: 0, opsIngested: 0, conflicts: 0, responses: { '2xx': 0, '4xx': 0, '5xx': 0 } }
}

export class Metrics {
  private readonly byTenant = new Map<string, TenantMetrics>()

  private get(tenant: string): TenantMetrics {
    let m = this.byTenant.get(tenant)
    if (!m) { m = blank(); this.byTenant.set(tenant, m) }
    return m
  }

  incSyncRequest(tenant: string): void { this.get(tenant).syncRequests += 1 }
  addOpsIngested(tenant: string, n: number): void { if (n) this.get(tenant).opsIngested += n }
  addConflicts(tenant: string, n: number): void { if (n) this.get(tenant).conflicts += n }

  recordResponse(tenant: string, status: number): void {
    const bucket = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 200 && status < 300 ? '2xx' : null
    if (bucket) this.get(tenant).responses[bucket] += 1
  }

  /** A plain snapshot for the /admin/metrics response. */
  snapshot(): { tenants: Record<string, TenantMetrics> } {
    const tenants: Record<string, TenantMetrics> = {}
    for (const [id, m] of this.byTenant) {
      tenants[id] = { ...m, responses: { ...m.responses } }
    }
    return { tenants }
  }

  /** Test-only reset. */
  reset(): void { this.byTenant.clear() }
}
