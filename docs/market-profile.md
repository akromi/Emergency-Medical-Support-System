# Market profile — Humanitarian / NGO / global health

> Branch `market/humanitarian`. This branch carries the **niche-first,
> documentation-tool** productization of TRIAGE-LINK — the recommended first
> move (`commercialization-index.md` Path A). See `commercialization-strategy.md`
> §4 and `regulatory-privacy-brief.md`.

## Beachhead

- **Buyer:** humanitarian NGOs, global-health programs, disaster/MCI and event
  medicine teams (e.g. MSF-style field clinics, Red Cross, UN agencies,
  mass-gathering medical).
- **Use:** field casualty documentation and coordination where connectivity is
  unreliable or absent — **offline-first is the core differentiator**.
- **Revenue horizon:** months. Best fit with our strengths; light reg load;
  reachable without procurement fortresses.

## Intended-use & regulatory posture

- **Intended use = documentation / coordination tool** (NOT a medical device).
  Keeps the compliance load light and revenue months away rather than years.
- **Compliance load (light):** data-handling under PIPEDA / GDPR and donor data
  policies; no SaMD certification on this path. See `regulatory-privacy-brief.md`.

## What this branch leans on (already built, P1)

This market is served by the **offline-first core**, not the hosted backend:

1. **Full offline operation** — IndexedDB, op-log, deterministic local resolve;
   no server dependency to document a casualty.
2. **Multi-language** — EN / FR / AR / FA built in, plus **loadable JSON language
   packs** so a deployment adds a language with no code release (critical for
   field NGOs in any region).
3. **At-rest encryption vault** (opt-in) + plain/encrypted backup & CSV export for
   low-infrastructure data handoff.
4. **Operator roster + RBAC-lite + step-up PIN + tamper-evident audit log** for
   shared field devices.

## What this branch should add next

- **Deployment context** *(done)* — a device-wide operation tag (name, response
  type, organization) shown in a banner and on the command summary, so a
  multi-team / multi-site response stays organized and donor reports have
  provenance (`src/db/deployment.ts`, `src/components/DeploymentBar.tsx`).
  Offline, blank by default.
- A **disaster/MCI deployment profile**: kiosk/shared-device defaults,
  mandatory-encryption policy, scene-roll-up/command-summary emphasis.
- Packaging for **fully air-gapped** install (PWA + optional self-hosted sync on a
  field laptop), and donor-friendly **data-export/retention** presets.
- Lightweight optional sync to the multi-tenant backend **only** where a program
  wants cross-team aggregation — never required.

## Go / no-go gate

This is the low-risk, fast-revenue entry. Proceed by default; revisit the
regulated/EMS path (the `market/ontario-ems` branch) as a deliberate later
expansion once there's field proof and funding.
