# Market profile — Official EMS (Ontario / provincial)

> Branch `market/ontario-ems`. This branch carries the **regulated official-EMS**
> productization of TRIAGE-LINK. It is the highest-value, highest-load path
> (`commercialization-index.md` Path C). See `commercialization-strategy.md` §4
> and `CERTIFICATION-ROADMAP.md` for the full case.

## Beachhead

- **Buyer:** provincial/municipal EMS services and Ontario Health; procurement-led,
  long cycles, RFP/standards-gated.
- **Use:** the primary, system-of-record prehospital patient care record (ePCR)
  for licensed paramedic services — not just a documentation aid.
- **Revenue horizon:** 12–24+ months. Biggest prize, but a fortress (OADS moat,
  entrenched cloud incumbents).

## Intended-use & regulatory posture

- **Intended use = SaMD-adjacent / regulated ePCR.** This is the heavy path:
  treat the record as a regulated clinical system, not a documentation tool.
- **Compliance load (heavy):** PHIPA + data residency (Ontario), SOC 2 Type II,
  a Quality Management System, and a certified-SaMD evidence stack where the
  intended use crosses the device line. See `regulatory-privacy-brief.md`.

## What this branch must add (Class-B P3 items)

These are the *path-gated* items deferred on the generic line — they only make
sense once this beachhead is chosen:

1. **OADS v4.0 conformance** (Ontario Ambulance Documentation Standard — mandatory
   data set + validation) and **NEMSIS v3.5** export for interoperability.
2. **ONE ID + PCR `$match` / DHDR** production integration via the existing
   `packages/ehr-gateway` Ontario Health adapter (real mTLS client cert, not the
   mock).
3. **CAD / dispatch integration** and hospital-EHR handover (partner agreements).
4. **SOC 2 Type II** + QMS evidence; formal validation/verification records.
5. Certified-SaMD evidence stack (if intended use is confirmed as a device).

## Reuses from the productized backend (already on `main`)

Multi-tenant isolation, OIDC SSO + role-based admin, per-tenant rate limits,
incremental sync, EHR-access + admin audit trails — all directly applicable and
necessary for a regulated, multi-service deployment.

## Go / no-go gate

Proceed **only** with the capital, regulatory appetite, and multi-year horizon
this market demands. Otherwise enter via the niche branches first and treat EMS
as a deliberate Phase-3 expansion.
