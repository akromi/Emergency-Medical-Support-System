# Market profile — Global / horizontal SaaS

> Branch `market/global`. This branch carries the **vendor-neutral, multi-tenant
> SaaS** posture of TRIAGE-LINK — a horizontal field-casualty / triage platform
> sold worldwide rather than tuned to one regulator or buyer. It builds directly
> on the productized backend now on `main` (`commercialization-index.md`,
> open-core posture in `commercialization-strategy.md` §6).

## Beachhead

- **Buyer:** any organization running field triage/casualty documentation at
  scale and wanting a hosted, multi-team product — across regions, not tied to
  one country's EMS system.
- **Use:** a configurable, standards-based platform; each customer is an isolated
  tenant with its own admins, keys, and data.
- **Revenue horizon:** months (self-serve / mid-market), built on the hosted
  backend already shipped.

## Intended-use & regulatory posture

- **Intended use = documentation / coordination tool**, configurable per
  deployment; regulated-device positioning is left to region-specific branches
  (e.g. `market/ontario-ems`).
- **Compliance load (configurable):** GDPR / data-residency knobs, per-tenant
  retention, SOC 2 as an enterprise-tier add-on. No single-jurisdiction lock-in.

## What this market is (already built — the productized backend)

This is the branch the Class-B work was for. It ships on:

1. **Multi-tenant isolation** — every store (ops, snapshots, audit, EHR audit)
   partitioned by tenant; one org can never read another's data.
2. **Tenant-admin API** — runtime provisioning + API-key issue/rotate/revoke;
   **OIDC SSO** with role-based admin and a who-did-what admin-audit trail.
3. **Efficient sync** — incremental `since`-cursor pull, narrowed un-acked push,
   per-tenant rate limits.
4. **Observability** — per-tenant counters at `/admin/metrics` + structured
   access logs.
5. **Interoperability** — FHIR bundles/handover; a pluggable EHR-gateway
   abstraction (region adapters slot in per market).

## What this branch should add next

- **Prometheus `/metrics` exporter** (the in-memory counters in scrape format).
- **JWKS/refresh + DR hardening**; per-tenant data-residency/retention config.
- **Open-core / dual-license** split (free core, paid org/compliance/support).
- A **self-serve onboarding** path (tenant signup → admin → first device).

## Go / no-go gate

Lowest regulatory friction of the three; the natural home for continued backend
productization. Region-specific compliance (OADS/NEMSIS, certified SaMD) is
deliberately **out of scope here** — it lives on the regulated branch.
