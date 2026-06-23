# TRIAGE-LINK — Build Roadmap

> A phased, checkable plan for taking TRIAGE-LINK from the current offline-first
> prototype to the production system described in `docs/ARCHITECTURE.md` (Part II).
> Each phase has a **goal**, concrete **tasks**, a **done-when** acceptance bar, and a
> **starter prompt** you can paste into Claude Code to kick it off.

**How to use this file.** Work phases roughly in order — later phases assume earlier ones.
Tick boxes as you go. Hand a single phase (or a single task) to Claude Code at a time;
small, verifiable steps beat "build the backend" in one shot.

---

## Principles to preserve (don't let these drift)

These are the load-bearing decisions from the architecture. Keep them intact as the code
grows — if a change would violate one, stop and reconsider.

- **Domain isolation.** `src/domain` and `src/fhir` stay framework-free — zero React, zero
  Dexie, zero backend imports. They must remain reusable by other clients and the backend.
- **Offline-first is non-negotiable.** The field client never blocks capture on the
  network. Sync is additive, never a prerequisite.
- **FHIR R4 is the integration boundary.** All inter-system exchange goes through FHIR
  bundles via the mapping layer — no bespoke wire formats.
- **One record = one sync unit.** `CasualtyRecord` keyed by `id` is the atomic unit the
  op-log and conflict resolver reconcile.

---

## Phase 0 — Gating decisions (no code)

**Goal:** answer the two questions that shape cost, timeline, and the entire SDLC before
writing more code.

- [ ] **Device classification.** Is this a *documentation tool* or *software that
      influences clinical decisions*? Decides FDA SaMD / EU MDR applicability (design
      controls, ISO 14971, IEC 62304). See `docs/ARCHITECTURE.md` §15.
- [ ] **Privacy regime.** HIPAA, GDPR, or both — driven by where patients and data live.
      Decides data-residency and retention requirements.
- [ ] Record both answers at the top of `docs/ARCHITECTURE.md` so every later phase
      inherits them.

**Done when:** classification and privacy regime are written down and agreed. Cheap to
decide now; expensive to retrofit later.

---

## Phase 1 — Harden & extract the core

**Goal:** lock in the reusability the whole architecture rests on, before anything bigger
depends on it.

- [ ] Add unit tests for `src/fhir/mapping.ts`: round-trip a `CasualtyRecord` through
      `toFhirBundle()` and assert resources (Patient / Encounter / Condition / Observation
      / Procedure / MedicationAdministration), their `subject` / `encounter` references,
      and the LOINC codes on vitals.
- [ ] Add unit tests for `src/domain/regions.ts`: `regionAt()` anatomical sidedness
      (anterior vs. posterior) and the out-of-bounds fallback.
- [ ] Add unit tests for `src/domain/id.ts` (uniqueness / format).
- [ ] Extract `src/domain` + `src/fhir` into a shared workspace package (e.g. an npm
      workspace `packages/core`) that the app imports — and that the future backend can
      import unchanged.
- [ ] Wire the tests into CI (`.github/workflows/ci.yml`).

**Done when:** `npm test` is green, the app still builds against the extracted package, and
the core has **no** React/Dexie imports.

**Claude Code starter prompt:**
> Read docs/ARCHITECTURE.md. Add a test runner (vitest) and write unit tests that
> round-trip a CasualtyRecord through toFhirBundle(), asserting the resources, references,
> and LOINC codes; plus tests for regionAt() sidedness. Then extract src/domain and
> src/fhir into a workspace package the app imports. Run the tests and the build, show me
> they pass, and confirm the core has no React or Dexie imports.

---

## Phase 2 — Sync backend (the big one)

**Goal:** a central system of record that reconciles offline edits safely. This is the
heart of the target architecture (`docs/ARCHITECTURE.md` §12).

- [ ] Stand up a TypeScript service (Node + Fastify or similar) that imports the shared
      core package from Phase 1.
- [ ] PostgreSQL as the system of record; schema keyed on record `id`.
- [ ] **Device op-log:** wrap `recordRepo` so each change is an ordered, append-only entry
      — the UI must not change.
- [ ] **Idempotent ingest:** replaying the same op-log over a flaky link is safe (no dupes,
      no lost writes).
- [ ] **Deterministic conflict resolution:** explicit merge rules — *never* last-write-wins
      (two medics editing one casualty must not silently lose a treatment).
- [ ] **Append-only audit trail** of every reconciled change.

**Done when:** two clients editing the same record offline, then syncing, converge to one
deterministic result with no data loss, and every change is in the audit trail.

**Claude Code starter prompt:**
> Scaffold a Fastify + PostgreSQL sync service that imports packages/core. Implement an
> append-only op-log on the device side around recordRepo (no UI change), idempotent
> ingest, and a deterministic conflict resolver (not last-write-wins) with an append-only
> audit trail. Add an integration test simulating two offline clients editing one record
> then syncing, and assert they converge with no lost writes.

---

## Phase 3 — Security (layer in alongside Phase 2)

**Goal:** make a device safe to hold real PHI. Maps to `docs/ARCHITECTURE.md` §14.

- [ ] Encrypt the on-device store (IndexedDB is plaintext today).
- [ ] TLS in transit; mTLS between services.
- [ ] OAuth2 / OIDC authentication; MFA for privileged roles.
- [ ] RBAC with least privilege (field / dispatch / clinician / admin scoped separately).
- [ ] Immutable, append-only audit log of PHI access (create/read/update/delete).
- [ ] No PHI in application logs or analytics.

**Done when:** no unauthenticated path reaches PHI, on-device data is encrypted at rest,
and every PHI access is audited.

---

## Phase 4 — Hospital handover

**Goal:** make the record usable at the receiving end (`docs/ARCHITECTURE.md` §11).

- [ ] Stand up / integrate a FHIR server as the EHR integration endpoint.
- [ ] **SMART-on-FHIR** for the EHR-authenticated handover path.
- [ ] QR / NFC scan of the case ID to pull a record at the bedside.
- [ ] **Master Patient Index** reconciliation: map the field case ID to a real hospital MRN.
- [ ] Validate exported bundles against the chosen profile (US Core / IPS).

**Done when:** a field-captured record can be scanned at a receiving facility, matched to a
patient, and imported into an EHR as a valid FHIR bundle.

---

## Phase 5 — Deploy for real

**Goal:** run the central tier per the deployment topology (`docs/ARCHITECTURE.md` §13).

- [ ] Containerize the services.
- [ ] Kubernetes topology: stateless services behind a load balancer + WAF; managed
      PostgreSQL / FHIR server / message queue.
- [ ] Message queue (e.g. Kafka) for the mass-casualty write burst and reconnection storm.
- [ ] CI/CD pipeline (build → test → deploy).
- [ ] Observability: logs, metrics, traces, alerting.

**Done when:** the system auto-scales under a simulated MCI burst and meets the
non-functional targets in `docs/ARCHITECTURE.md` §16 (availability, sync latency).

---

## Parallel track — Anatomical body chart

Independent of the backend work; high clinical value, low architectural risk. `regionAt()`
is the single seam to swap.

- [ ] Replace the rectangular zones in `src/domain/regions.ts` with a precise anatomical
      SVG model.
- [ ] Support named regions and burn TBSA estimation.
- [ ] Keep the `regionAt(x, y, view)` signature stable so nothing upstream changes.

**Done when:** markers resolve to precise anatomical regions and the rest of the app is
untouched.

---

## Suggested order

```
Phase 0  →  Phase 1  →  Phase 2  ──┐
                                   ├─→  Phase 4  →  Phase 5
                        Phase 3  ──┘
        Anatomical body chart runs in parallel, anytime after Phase 1.
```

Start with **Phase 1**: it's small, verifiable, and de-risks everything downstream by
proving the core is reusable before the backend leans on it.
