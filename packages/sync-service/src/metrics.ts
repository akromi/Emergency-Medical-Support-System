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

/** A structured access-log line (request id, method, path, tenant, status, latency). */
export interface AccessLogEntry {
  /** Correlation id — the inbound x-request-id, or a minted UUID. */
  requestId: string
  method: string
  path: string
  tenant: string
  status: number
  ms: number
  /** Internal error detail for a 5xx — server-side diagnosis only, never sent
   *  to the client (the response is sanitized). Absent for non-5xx responses. */
  error?: string
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

/** Content-type for the Prometheus text exposition format. */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

const escapeLabel = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

/** Render a metrics snapshot in Prometheus text exposition format (counters with
 *  a `tenant` label) so the per-tenant counters can be scraped by Prometheus. */
export function renderPrometheus(snap: { tenants: Record<string, TenantMetrics> }): string {
  const lines: string[] = []
  const counter = (name: string, help: string, rows: Array<{ labels: Record<string, string>; value: number }>) => {
    lines.push(`# HELP ${name} ${help}`)
    lines.push(`# TYPE ${name} counter`)
    for (const { labels, value } of rows) {
      const lbl = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')
      lines.push(`${name}{${lbl}} ${value}`)
    }
  }
  const tenants = Object.entries(snap.tenants)
  counter('triagelink_sync_requests_total', 'Total POST /sync requests.',
    tenants.map(([t, m]) => ({ labels: { tenant: t }, value: m.syncRequests })))
  counter('triagelink_ops_ingested_total', 'Total ops ingested (new, non-duplicate).',
    tenants.map(([t, m]) => ({ labels: { tenant: t }, value: m.opsIngested })))
  counter('triagelink_conflicts_total', 'Total conflicts resolved.',
    tenants.map(([t, m]) => ({ labels: { tenant: t }, value: m.conflicts })))
  counter('triagelink_responses_total', 'Total responses by status class.',
    tenants.flatMap(([t, m]) => (['2xx', '4xx', '5xx'] as const).map((s) => ({ labels: { tenant: t, status: s }, value: m.responses[s] }))))
  return lines.join('\n') + '\n'
}
