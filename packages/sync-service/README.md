# @triage-link/sync-service

Fastify + PostgreSQL conflict-aware sync service, plus the provincial-EHR
integration routes (`/ehr/*`). The PWA never talks to Ontario Health directly;
it calls these routes, and an injected `EhrGateway` handles auth, mTLS,
conformance, and audit.

## Multi-tenancy

The service is tenant-partitioned: ops, snapshots, and the audit trail all carry
a `tenant_id`, and every query is scoped to it, so one organization can never
read or resolve another's records — even at the same record id.

Tenancy is selected by the API key:

- **`SYNC_TENANTS`** — a JSON array of per-tenant keys, e.g.
  `[{"id":"org-a","token":"…"},{"id":"org-b","token":"…"}]`. A request's bearer
  token picks its tenant and scopes all its data.
- **`SYNC_API_TOKEN`** — the legacy single-tenant token; requests using it are
  scoped to the `default` tenant. May be combined with `SYNC_TENANTS`.
- **Neither set** — dev/test mode: unauthenticated and single `default` tenant
  (the service behaves exactly as before).

Isolation is enforced at the data layer (not just the edge) and covered by
`test/tenancy.integration.test.ts`.

### Tenant-admin API (runtime provisioning & key rotation)

Static `SYNC_TENANTS` is fine for a fixed roster; for a hosted service that
provisions tenants and rotates keys without a restart, set **`SYNC_ADMIN_TOKEN`**
to mount the admin API at `/admin/*` (gated by `Authorization: Bearer <admin
token>`). Tenants and their keys then live in the database (`tenants`,
`tenant_keys`). API keys are stored only as a **SHA-256 hash** — the plaintext
`tlk_…` token is returned **once**, at issue time, and can never be recovered.

| Method & path | Purpose |
| --- | --- |
| `POST /admin/tenants` `{id,name}` | Create a tenant |
| `GET /admin/tenants` | List tenants |
| `PATCH /admin/tenants/:id` `{status}` | Enable / disable a tenant |
| `POST /admin/tenants/:id/keys` `{label?}` | Issue a key (returns the token once) |
| `GET /admin/tenants/:id/keys` | List keys (hints + metadata, never tokens) |
| `DELETE /admin/tenants/:id/keys/:keyId` | Revoke a key |

**Rotation** = issue a new key, switch the client, then revoke the old one.
Disabling a tenant immediately stops all its keys. The admin API is intentionally
hidden from the public OpenAPI doc. Covered by `test/admin-api.integration.test.ts`.

## Local testing with Swagger (no database, no credentials)

The production entry point (`npm start`) needs PostgreSQL and Ontario Health /
ONE ID credentials. For local exploration there's a **zero-infra dev server**
that wires the same app to an in-memory database (`pg-mem`) and the in-memory
`MockGateway`:

```sh
npm run dev --workspace @triage-link/sync-service
```

Then open:

- **Swagger UI** — http://localhost:8080/docs — expand an endpoint, click
  **Try it out**, edit the request, **Execute**.
- **OpenAPI doc** — http://localhost:8080/docs/json

Everything is answered by the `MockGateway` (fabricated patients: HCN
`1234567890` Jane Doe, `9876543210` John Roe), so you can exercise the whole
integration — patient `$match`, **Send to EHR** (`/ehr/handover`), clinical
context — with no secrets. Set `PORT` to change the port.

> This validates *our* code — routes, schemas, FHIR shapes, error handling. The
> live Ontario connection (real ONE ID token + client certificate) is only
> reachable from the production `server.ts`, never from a browser/dev box.

## Postman / Insomnia

Either point your client at the live spec (`http://localhost:8080/docs/json`,
"Import → from URL") or export it to a file:

```sh
npm run openapi:export --workspace @triage-link/sync-service   # → openapi.json
```

## Contract test

`test/openapi-contract.test.ts` keeps the docs honest: it asserts every EHR
operation is documented and that each request **example** advertised in the
OpenAPI doc actually succeeds against the live (stubbed) app — so "Try it out"
in Swagger never breaks. Runs as part of `npm test`.
