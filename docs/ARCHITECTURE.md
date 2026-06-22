# TRIAGE-LINK — Technical Architecture

> Offline-first Progressive Web App for casualty care & transport documentation.
> This document describes the system's goals, structure, data model, runtime
> behaviour, and the constraints a production deployment would have to satisfy.

> ⚠️ **Prototype — not a medical device and not for clinical use.** The
> _Security & Regulatory_ section describes what a real deployment would require;
> none of it is implemented here.

---

## 1. Purpose & context

TRIAGE-LINK is a digital replacement for the paper triage tag used by emergency
responders at accident scenes and mass-casualty incidents. A single responder,
often with no network connectivity, captures a patient's identity, injuries,
vital signs, and treatments at the point of care, then hands that record to a
receiving hospital as a standards-compliant **HL7 FHIR R4** bundle.

### Primary actors

| Actor | Role |
|---|---|
| **Field responder** (paramedic, medic, first-aider) | Captures the casualty record on a phone/tablet, usually offline |
| **Receiving facility** (hospital EHR) | Imports the exported FHIR bundle at handover |

### Driving requirements

1. **Works with no connectivity.** The scene may have no signal; the app must be
   fully functional offline and lose no data.
2. **Runs anywhere, installs like an app.** Responders carry heterogeneous
   devices; a single codebase must run on all of them.
3. **Interoperates with hospital systems.** Handover output must be in a format
   hospital EHRs already understand.
4. **Fast, low-friction capture.** Tap-to-mark injuries; auto-save; no modal
   "save" step.

---

## 2. Architectural goals & principles

| Principle | How it shows up in the code |
|---|---|
| **Offline-first** | All state lives on-device in IndexedDB; no backend is required for the core workflow |
| **Portability first** | Delivered as a PWA — one static bundle runs on any modern browser and installs to the home screen |
| **Framework-free core** | `src/domain` and `src/fhir` are plain TypeScript with zero React/Dexie imports, so they can be reused by a future React Native client or a backend sync service unchanged |
| **Single source of truth** | The `CasualtyRecord` type in `src/domain/types.ts` is the canonical model every other layer maps to/from |
| **Standards over bespoke formats** | Interop is via HL7 FHIR R4 with LOINC-coded vitals, not a proprietary schema |
| **Local-only by default** | No PHI leaves the device unless the user explicitly exports a bundle |

---

## 3. Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Client framework | **React 18 + TypeScript** | Component model for the capture UI; static typing across the domain |
| Build / dev server | **Vite 5** | Fast dev server, simple static production build |
| Offline storage | **IndexedDB** via **Dexie 4** | Durable, async, on-device store with a typed table API; no backend needed |
| Offline shell | **vite-plugin-pwa** (Workbox) | Service worker precaches the app so it loads with no network |
| Interop | **HL7 FHIR R4** | The de-facto hospital EHR exchange standard |

There are intentionally **no runtime dependencies** beyond React and Dexie — the
domain and mapping logic are hand-written TypeScript.

---

## 4. System structure

The app is organised in layers, from a framework-free core outward to the UI.
Dependencies point **inward only**: the UI depends on the domain, never the
reverse. The domain model and FHIR mapping live in their own **npm workspace
package, `@triage-link/core`**, so they can be reused by other clients (e.g. a
React Native app or a backend sync service) without the React/Dexie shell.

> **Note on paths.** Modules referenced below as `domain/…` and `fhir/…` live in
> the core package under `packages/core/src/`; the React app lives at the repo
> root under `src/` and imports them via the package name `@triage-link/core`.

```
┌──────────────────────────────────────────────────────────┐
│  UI layer (React) — repo root /src                         │
│  App.tsx · components/BodyChart.tsx                        │
│  - capture forms, injury chart, panels, auto-save wiring   │
└───────────────┬───────────────────────┬──────────────────┘
                │  imports @triage-link/core                 │
        ┌───────▼────────┐      ┌────────▼─────────┐
        │  Persistence    │      │  Interop          │
        │  db/database.ts │      │  fhir/mapping.ts  │
        │  db/repository  │      │  fhir/types.ts    │
        │  (Dexie/IDB)    │      │  (R4 Bundle)      │
        └───────┬────────┘      └────────┬─────────┘
                │                        │
        ┌───────▼────────────────────────▼──────────────────┐
        │  @triage-link/core  (framework-free package)       │
        │  domain/types · injuries · regions · id            │
        │  fhir/mapping · fhir/types                          │
        │  THE SINGLE SOURCE OF TRUTH                         │
        └────────────────────────────────────────────────────┘
```

### 4.1 Directory map

The repository is an **npm workspaces** monorepo: the framework-free core is a
package, and the PWA app at the root consumes it.

```
.
├─ packages/
│   └─ core/                  @triage-link/core — framework-free, reusable
│       ├─ src/
│       │   ├─ domain/        Framework-free model — reusable everywhere
│       │   │   types.ts        CasualtyRecord + sub-types; triage labels/colours;
│       │   │                   createEmptyRecord() factory
│       │   │   injuries.ts      Catalog of injury types (key, label, colour)
│       │   │   regions.ts       Body-region hit-testing over the SVG space
│       │   │   id.ts            Case-ID and local-ID generation
│       │   ├─ fhir/          HL7 FHIR R4 mapping — framework-free
│       │   │   types.ts         Minimal FHIR resource/bundle types
│       │   │   mapping.ts       CasualtyRecord -> FHIR Bundle (Patient/Encounter/
│       │   │                    Condition/Observation/Procedure/MedicationAdmin)
│       │   └─ index.ts       Barrel — the package's public API
│       └─ test/
│           fhir-mapping.test.ts  Round-trips a CasualtyRecord through
│                                 toFhirBundle() (Vitest)
└─ src/                       The PWA app (depends on @triage-link/core)
    ├─ db/                    On-device persistence
    │   database.ts             Dexie schema (IndexedDB database "triage-link")
    │   repository.ts           save / get / list / remove over the records table
    ├─ components/
    │   BodyChart.tsx           Interactive anterior/posterior injury-marking SVG
    ├─ App.tsx                Capture UI; wires core + db together; auto-save
    ├─ main.tsx               React entry point
    └─ styles.css             Application styling
```

---

## 5. Domain model

The entire clinical record for one patient is a single `CasualtyRecord`
(`src/domain/types.ts`):

```
CasualtyRecord
├── id                      stable case ID (also seeded as the MRN)
├── tombstone   Tombstone   identity: name, dob, sex, mrn, bloodType,
│                           address, nextOfKin, nextOfKinPhone
├── incident    Incident    injuryTime, mechanism, location, triage category
├── injuries    Injury[]    each: view, x/y, region, type, severity, notes
├── vitals      VitalSign[] each: takenAt + hr/bp/rr/spo2/gcs/pain
├── treatments  Treatment[] each: performedAt, type, detail, place, provider
├── handover    Handover?   at, clinician, facility (null until handed over)
├── createdAt   number
└── updatedAt   number
```

Key design points:

- **One record = one unit of sync.** The Dexie store keys on `id`, and the
  future roadmap treats a record as the atomic unit a sync/op-log layer would
  reconcile.
- **"Tombstone" = stable identity layer**, deliberately separated from the
  episode-specific `incident` data, mirroring how hospital systems separate a
  Patient from an Encounter.
- **Triage** uses the standard START scheme — `immediate` (red), `delayed`
  (yellow), `minor` (green), `deceased` (black) — with labels and colours
  centralised in `TRIAGE_LABELS` / `TRIAGE_COLORS`.

### 5.1 Body-region resolution

`domain/regions.ts` divides the body silhouette's SVG user space
(`viewBox 0 0 220 440`) into rectangular hit-test zones. When a responder taps
the chart, `regionAt(x, y, view)`:

1. Finds the first region box containing the point (Head, Chest, Thigh, …).
2. Applies **anatomical sidedness** — on the *anterior* view, image-left is the
   patient's **right**; the posterior view flips it — so a marker records
   "R Forearm", "L Thigh", etc.
3. Falls back to a vertical-band heuristic if the tap lands outside any defined
   box.

This rectangular model is explicitly a placeholder; the roadmap replaces it with
a precise anatomical SVG (named bones, burn TBSA).

---

## 6. Persistence

`src/db/` provides durable, offline on-device storage.

- **`database.ts`** declares a Dexie database named `triage-link` with a single
  `records` table, indexed on `id` (primary key) and `updatedAt`.
- **`repository.ts`** is a thin repository exposing `save`, `get`, `list`,
  `remove`. `save()` stamps `updatedAt` and `put`s the whole record; `list()`
  returns records newest-first by `updatedAt`.

Because IndexedDB is local to the browser/device, the core workflow needs **no
server**. The repository is intentionally thin so a future sync layer can wrap it
with an operation log without the UI changing.

---

## 7. Runtime data flow

### 7.1 Capture & auto-save

```
User edits a field / taps the body chart
        │
        ▼
App mutator builds the next immutable CasualtyRecord
        │
        ▼
persist(next):
   - setRecord(next)          → React re-renders immediately
   - debounce 400 ms          → coalesces rapid edits
        │  (after quiet period)
        ▼
   recordRepo.save(next)      → writes to IndexedDB
   recordRepo.list()          → refreshes the "Saved casualties" list
```

State updates are **immutable** (each mutator spreads a new record), which keeps
React rendering predictable. The **400 ms debounce** in `App.tsx` means rapid
typing produces one write per quiet period rather than one per keystroke.

### 7.2 Injury placement

```
Tap on BodyChart SVG
  → toUserSpace(): screen coords → SVG user space via getScreenCTM().inverse()
  → bounds check (ignore taps outside the body box)
  → regionAt(x, y, view): resolve anatomical region
  → onPlace(): App appends a new Injury (active type, default severity)
  → marker rendered; injury selected for inline severity/notes editing
```

### 7.3 FHIR export at handover

```
"Export FHIR ↓"
  → toFhirBundle(record)              (pure function, no I/O)
  → JSON.stringify(bundle, null, 2)
  → Blob (application/fhir+json)
  → object URL → anchor click → download "<case-id>-fhir-bundle.json"
```

Export is a pure, client-side transform; nothing is transmitted.

---

## 8. FHIR interoperability

`src/fhir/mapping.ts` translates the internal `CasualtyRecord` into a FHIR R4
**Bundle** (`type: collection`). The mapping mirrors clinical semantics:

| Domain concept | FHIR resource | Notes |
|---|---|---|
| Tombstone (identity) | `Patient` | name, gender, birthDate, address, next-of-kin contact; identifier system `urn:triage-link:case` |
| Incident / transport episode | `Encounter` | `class = EMER`; status `in-progress` until handover, then `finished`; mechanism → `reasonCode` |
| Each injury | `Condition` | category `injury`; `bodySite` = region + view; `severity`; notes |
| Each vital sign | `Observation` | category `vital-signs`; **LOINC-coded** (e.g. HR `8867-4`, SpO₂ `59408-5`, BP `85354-9`); value + unit |
| Treatment (non-drug) | `Procedure` | status `completed`; performer = provider; detail + place in note |
| Treatment (medication) | `MedicationAdministration` | chosen when the intervention type matches `/medication/i` |

All resources reference the patient and encounter (`subject` / `encounter` /
`context`), so the bundle is internally consistent and importable as one episode.

`fhir/types.ts` defines a **minimal, hand-rolled subset** of FHIR types — enough
to produce a valid bundle without pulling in a heavyweight FHIR library, keeping
the bundle size and dependency surface small.

> **Scope note:** the bundle is a `collection`, not a `transaction`, and the FHIR
> types are a pragmatic subset rather than the full R4 schema. A production
> integration would validate against a FHIR server and likely use profiles
> (e.g. US Core / IPS) and full resource typing.

---

## 9. Offline & PWA strategy

- **App shell caching.** `vite-plugin-pwa` (Workbox) generates a service worker
  that precaches the built static assets, so after the first load the app opens
  with no network.
- **Data offline.** All records persist in IndexedDB; there is no network read
  path in the core workflow, so being offline is the *normal* operating mode,
  not a degraded one.
- **Static deployment.** `npm run build` type-checks (`tsc --noEmit`) and emits a
  static `/dist` bundle deployable to any static host or CDN (GitHub Pages,
  Netlify, S3, nginx). No server-side runtime is involved.

---

## 10. Security & regulatory considerations

**Status: not implemented — this is a prototype.** A deployment processing real
protected health information (PHI) would need to address, at minimum:

| Area | Requirement |
|---|---|
| **Device classification** | FDA SaMD / EU MDR assessment if the app influences clinical decisions |
| **Privacy regime** | HIPAA (US) / GDPR (EU) — lawful basis, data subject rights, retention |
| **Encryption** | At rest (IndexedDB is *not* encrypted by default) and in transit |
| **Authentication** | OAuth2 / OIDC, and **SMART-on-FHIR** for EHR-integrated handover |
| **Authorization** | Role-based access control (RBAC) for responders vs. facilities |
| **Audit** | Immutable audit logging of access and changes |
| **Integrity at handover** | Signing / provenance on the exported bundle |

Today, data is **local to the device and unencrypted**, and there is no auth.
The footer and README state plainly that the app is not for clinical use.

---

## 11. Extensibility & roadmap

Because the domain and FHIR layers are framework-free, several roadmap items can
be added without touching the UI:

- **Conflict-aware sync.** Wrap `recordRepo` with an operation log and reconcile
  records (the atomic sync unit) against a central service.
- **Anatomical body chart.** Replace the rectangular `regions.ts` zones with a
  precise anatomical SVG supporting burn TBSA and named bones — `regionAt()` is
  the single seam to swap.
- **Handover scanning.** NFC/QR handover plus master-patient-index
  reconciliation.
- **Security hardening.** Auth (OAuth2/OIDC, SMART-on-FHIR), audit logging,
  encryption at rest.
- **Reuse on other clients.** The `domain` + `fhir` modules are factored into the
  `@triage-link/core` workspace package, which builds to `dist/` (ES module +
  `.d.ts`) and exposes a Node-resolvable `exports` map, so it can be imported by
  a React Native app or a Node sync service — not just the bundled PWA.

---

## 12. Build, run, deploy

```bash
npm install        # installs workspaces; builds @triage-link/core (prepare)
npm run dev        # Vite dev server at http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # run @triage-link/core unit tests (Vitest)
npm run build      # type-check + production build to /dist
npm run preview    # serve the production build locally

# Core package (consumed by the app via its built dist, and by Node consumers):
npm run build --workspace @triage-link/core   # emit dist/ (ESM + .d.ts)
```

The app resolves `@triage-link/core` through the package's `exports` map (its
built `dist/`), which is produced automatically on `npm install` via the
package's `prepare` script. The app's `dev`, `build`, and `typecheck` scripts
each rebuild the core package first (via `pre*` hooks), so the PWA never bundles
or type-checks against a stale `dist/`.

`/dist` is a self-contained static bundle; the service worker makes it work
offline after the first load.

---

## 13. Key design decisions (summary)

1. **PWA over native** — maximum portability from one codebase; installable;
   offline-capable; static deployment.
2. **Framework-free domain & FHIR core** — reusable across future clients and
   services; the `CasualtyRecord` is the single source of truth.
3. **IndexedDB/Dexie, record-as-sync-unit** — durable offline storage with a
   clean seam for a future op-log sync layer.
4. **FHIR R4 for interop** — speak the hospital's language at handover rather
   than inventing a format.
5. **Immutable state + debounced auto-save** — predictable rendering and
   low-friction, loss-resistant capture.
