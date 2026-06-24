# @triage-link/ehr-gateway

Provincial EHR adapters for TRIAGE-LINK, behind the framework-free `EhrGateway`
port defined in `@triage-link/core`.

> ⚠️ Prototype. Connecting to Ontario's production EHR requires being (or
> partnering with) an approved Health Information Custodian, signed agreements
> with Ontario Health, ONE ID credentials, a client certificate for mutual TLS,
> and passing conformance in their sandbox. This package is built so all of that
> is a configuration/credential change — not a code change.

## Why a separate server-side package

The PWA can't hold ONE ID secrets or present a client certificate from a
browser. So the integration lives behind the backend: the PWA calls the
`sync-service` EHR routes, and this adapter handles auth, mutual TLS,
FHIR conformance, retries, and audit.

```
PWA ──HTTP──▶ sync-service /ehr/* ──▶ EhrGateway ──▶ ONE Access Gateway ──▶ PCR / repositories
                                         ▲
                                  (MockGateway in dev)
```

## What it implements

| Capability | Ontario interface | Status |
|---|---|---|
| `matchPatient` | **PCR `Patient/$match`** (resolve identity by OHIP health-card #) | ✅ implemented |
| `ping` | CapabilityStatement (`/metadata`) | ✅ |
| `fetchContext` | DHDR / OLIS / Ontario Patient Summary (search + merge) | ✅ implemented |
| `contributeHandover` | transaction Bundle POST (write — restricted) | ✅ implemented |

Writes (`contributeHandover`) are **never retried** — a transient failure won't
silently double-contribute. Reads (`matchPatient`, `fetchContext`) retry with
backoff. Every access emits an ATNA `AuditEvent`; sync-service persists these to
the `ehr_audit` table and serves them at `GET /ehr/audit`.

- **`OntarioHealthGateway`** — the real adapter against the ONE Access Gateway.
- **`OneIdClient`** — OAuth 2.0 client-credentials (OIDC) token client with caching/refresh.
- **`MockGateway`** — in-memory provider for dev/demo/tests; same parser as production.
- **`HttpClient`** — typed errors (`EhrError`), exponential-backoff retries, an
  mTLS seam (pass an undici `dispatcher`).

Every access emits an ATNA `AuditEvent` through the injected `onAudit` sink, as
required by Ontario Health's privacy & security policy.

## Configuration (env, read in `sync-service/src/server.ts`)

With ONE ID unset, the service falls back to `MockGateway` so it runs end-to-end
in dev. To target Ontario:

| Variable | Meaning |
|---|---|
| `ONE_ID_TOKEN_URL` | ONE ID OIDC token endpoint |
| `ONE_ID_CLIENT_ID` / `ONE_ID_CLIENT_SECRET` | client-credentials |
| `ONE_ID_SCOPE` | granted scopes (e.g. `pcr/Patient.read`) |
| `OH_FHIR_BASE_URL` | ONE Access Gateway FHIR base |
| `OH_AGENT_ID` | requesting clinician id for the audit trail |

Mutual TLS: construct an undici `Agent` with your client certificate and pass it
as `dispatcher` to `OneIdClient` / `OntarioHealthGateway` (see the comment in
`server.ts`).

## Before going live

1. Confirm canonical identifier systems / profiles in `core/src/ehr/ontario.ts`
   against the **PCR FHIR Implementation Guide** version you onboard against.
2. Wire `onAudit` to a real audit store / SIEM.
3. Add the mTLS `dispatcher`.
4. Run conformance in the Ontario Health sandbox.

References: PCR FHIR Implementation Guide, ONE Access Gateway Transport
Specification — ehealthontario.on.ca.
