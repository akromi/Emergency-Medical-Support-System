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
- A **disaster/MCI deployment profile** *(done)* — an MCI-mode switch on the
  deployment bar that, in one toggle, makes **encryption mandatory** (via the
  vault required-policy: forces passphrase setup, can't be turned off while on)
  and surfaces a **Command** shortcut to the scene roll-up. Off by default;
  re-asserted on reload. **Kiosk/operator-required defaults** *(done)*: in MCI
  mode the bar prompts to **assign an on-duty operator** until one signs in (so
  every record is attributed on a passed-around device), and the idle
  **auto-lock tightens to 2 min** (from the 5-min default). Both revert when MCI
  is off.
- Donor-friendly **data-export** *(done)* — the deployment tag (operation /
  response type / organization) is stamped onto every CSV row and carried in the
  JSON backup, so an extract handed to a donor or coordination cell is
  self-describing; and a **date-range filter** scopes the CSV to just the
  casualties logged in a window (last 24 h / 7 / 30 days, or custom). Full
  backups stay whole (safety net).
- Donor-friendly **retention presets** *(done)* — a device-wide data-retention
  window (off / 30 / 90 / 180 / 365 days) in the saved-casualties header. Records
  first documented longer ago than the window are flagged with a count, and an
  operator **purges them in one confirmed, step-up-gated step** — never a silent
  background delete. Off by default (`src/db/retention.ts`).
- Packaging for **fully air-gapped** install (PWA + optional self-hosted sync on a
  field laptop).
- Lightweight optional sync to the multi-tenant backend **only** where a program
  wants cross-team aggregation — never required.

## Go / no-go gate

This is the low-risk, fast-revenue entry. Proceed by default; revisit the
regulated/EMS path (the `market/ontario-ems` branch) as a deliberate later
expansion once there's field proof and funding.
