# Sync-service hardening reference

Operator reference for the hosted **`packages/sync-service`** (Fastify) — the
multi-tenant op-log sync + provincial-EHR backend. It lists every guard, its
configuration knob, its default, and the threat it addresses.

All knobs live in the `SecurityOptions` object passed to `buildApp({ security })`
(`src/app.ts`). The production entrypoint (`src/server.ts`) reads them from
environment variables. **Everything is off / permissive by default** so that dev
and the test suite run without configuration; a production deploy MUST set at
least `authToken` (or per-tenant `tenants`) and `corsOrigins`.

---

## At a glance

| Guard | Knob (`SecurityOptions`) | Default | Threat addressed |
|---|---|---|---|
| Bearer auth (data plane) | `authToken` / `tenants` | off (open) | Unauthenticated access to `/sync`, `/ehr/*` |
| Tenant isolation | `tenants` / `tenantStore` | single `default` tenant | One tenant reading/resolving another's data |
| Admin auth | `adminToken` / OIDC verifier | off (no `/admin`) | Unauthorized tenant/key administration |
| Per-IP rate limit | `rateLimitMax` | 300 / min | Brute-force, generic DoS |
| Per-tenant sync rate limit | `syncRateLimitMax` | 1000 / min | One tenant exhausting throughput |
| Request body size | `bodyLimit` | 10 MB | Oversized-payload memory DoS |
| Ingest batch size | — (schema) | 10 000 ops | Unbounded ingest work per request |
| Full-state pagination | `syncPageLimit` | 500 (max 1000) | Unbounded first-sync response |
| Per-tenant storage quota | `tenantQuota` | unlimited | Noisy-neighbor storage exhaustion |
| Audit-log retention (TTL) | `auditRetentionMs` | no prune | Unbounded audit growth over time |
| Error sanitization | — (always on) | — | Internal detail leaking on 5xx |
| Security headers | — (helmet, always on) | — | Clickjacking, MIME sniffing, etc. |
| CORS default-deny | `corsOrigins` | cross-origin disabled | Unwanted browser cross-origin calls |
| Request-id correlation | — (always on) | — | Untraceable requests across tiers |
| Readiness / liveness | — (`/ready`, `/health`) | — | Routing traffic to an unready instance |

---

## Authentication & tenancy

- **Data-plane bearer auth** — `authToken` (single-tenant, scoped to `default`)
  and/or `tenants: [{ id, token }]` (multi-tenant). With neither set and no
  `tenantStore`, the data plane is **open** (dev/test). The matched token also
  *selects the tenant*, so isolation is enforced at the data layer, not just the
  edge. Token comparison is constant-time (`timingSafeEqual`).
- **Tenant isolation** — every store read/write is scoped by `tenant_id`; a
  request can never read or resolve another tenant's records, ops, snapshots, or
  audit. Runtime-managed tenants/keys come from a `tenantStore`
  (`POST /admin/tenants`, key issue/rotate/revoke).
- **Admin auth** — `/admin/*` is gated by a static `adminToken` and/or an
  OIDC-verified JWT (RS256/384/512, mandatory `iss`/`aud`/numeric `exp`, optional
  role claim). The admin surface is hidden from the public OpenAPI doc.

## Abuse / DoS bounds (the sync data plane is bounded on every axis)

- **Per-IP rate limit** — `rateLimitMax` (default **300/min**), `@fastify/rate-limit`.
- **Per-tenant sync rate limit** — `syncRateLimitMax` (default **1000/min**),
  keyed by tenant (falls back to IP pre-auth).
- **Body size** — `bodyLimit` (default **10 MB**; handover bundles embed photos).
- **Ingest batch size** — `/sync` body schema caps `ops` at **10 000** items.
- **Full-state pagination** — the no-cursor `/sync` pull is paginated by record
  id; `syncPageLimit` sets the page (default **500**, hard max **1000**). Clients
  page with `after` until `nextPage` is `null`, then checkpoint `cursor` and sync
  incrementally via `since`.
- **Per-tenant storage quota** — `tenantQuota: { maxOps?, maxRecords? }`
  (default **unlimited**). A tenant at/over a cap has further **writes** refused
  with a clear **403** (carrying `quota` + `usage`); **reads/pulls are always
  allowed**, so a full tenant can still sync down. Enforced at write time, so a
  tenant may overshoot by at most one (already-capped) batch.

Together: requests are bounded by **size** (body limit), **count** (batch cap),
**rate** (per-IP + per-tenant), **storage** (quota), and **time** (audit TTL).

## Data lifecycle

- **Audit-log retention (TTL)** — `auditRetentionMs` sets the default window for
  `POST /admin/retention`, which prunes observational audit entries older than the
  window across all tenants (per-request `auditMaxAgeMs` override). Default-off.
- **The op-log is never pruned.** It is the source of truth: the server re-folds a
  record's *full* op history to resolve state, and order-independent conflict
  resolution relies on per-field Lamport history that the snapshot does not retain.
  Safe op compaction requires a **causal-stability** mechanism (knowing no
  earlier-Lamport op can still arrive) — a deferred follow-up, see
  `src/retention.ts`.

## Hygiene & observability

- **Error sanitization** (always on) — 5xx responses return a generic envelope
  (`{ error, message, statusCode, requestId }`); the real cause is kept
  server-side in the access log, correlatable by request id. 4xx keep their
  client-facing validation message. 404s are consistent and request-id stamped.
- **Security headers** (helmet, always on) — `nosniff`, frameguard `DENY`, HSTS,
  no-referrer. CSP belongs to the web app, not this JSON API.
- **CORS default-deny** — only origins in `corsOrigins` may call the API; unset →
  no CORS headers (cross-origin blocked).
- **Request-id correlation** — an inbound `x-request-id` is honoured (else a UUID
  is minted), echoed on every response, and emitted in the structured access log,
  so a trace spans PWA → sync-service → EHR gateway.
- **Metrics** — per-tenant counters (`/admin/metrics`, Prometheus at
  `/admin/metrics/prometheus`): sync requests, ops ingested, conflicts, quota
  rejections, and responses by status class.
- **Probes & lifecycle** — `/health` (liveness, open) and `/ready` (readiness, DB
  connectivity); graceful shutdown drains in-flight requests.
- **Admin console** (opt-in, `ENABLE_ADMIN_CONSOLE=true`) — a static operator UI
  at `GET /console` for the `/admin/*` API (metrics, tenants, keys, retention,
  audit). Only mounts when the admin API is configured. The page holds no
  secrets and sits outside the `/admin/*` bearer gate; it prompts for the admin
  credential (static token or a pasted OIDC JWT) and the API gate enforces every
  call. Off by default.

---

## Recommended production baseline

```
authToken (or tenants) ........ set         # close the data plane
corsOrigins ................... set         # the web app's origin(s) only
adminToken (or OIDC) .......... set         # if using the admin API
trustProxy .................... true        # behind a reverse proxy / LB
rateLimitMax / syncRateLimitMax  tune to capacity
tenantQuota ................... set per plan # noisy-neighbor guard
auditRetentionMs .............. set + schedule POST /admin/retention
```

Leave `bodyLimit`, `syncPageLimit`, and the batch cap at their defaults unless a
specific workload requires otherwise.
