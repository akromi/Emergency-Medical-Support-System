# TRIAGE-LINK

> Offline-first Progressive Web App for casualty care & transport documentation.
> Field responders capture patient identity, injuries on an anatomical 2-D body
> chart, vitals, and treatments — then sign off and hand over to a hospital as an
> HL7 FHIR bundle. Fully usable with zero connectivity, and multilingual
> (English / French / Arabic / Persian, including right-to-left).

> ⚠️ **Prototype — not a medical device and not for clinical use.** See _Regulatory_ below.

> 📊 **Capability overview deck:** [`docs/marketing/`](docs/marketing/) — a
> self-contained slide deck (HTML + PDF) covering the PWA, the encryption & audit
> layer, the multi-tenant backend, and the market flavors.

## Why these technologies (portability first)

A PWA is the most portable target available: it runs on any device with a modern
browser, installs to the home screen, works fully offline, and deploys as static
files to any host or CDN — one codebase, no per-platform builds.

| Concern | Choice | Why |
|---|---|---|
| Client | **PWA** (React + TypeScript + Vite) | Runs anywhere; installable; offline-capable |
| Offline storage | **IndexedDB** via **Dexie** | Durable on-device store, no backend required |
| Offline shell | **vite-plugin-pwa** (Workbox) | Service worker caches the app for offline use |
| Domain logic | Framework-free **TypeScript** core (`@triage-link/core`) | Reusable; single source of truth |
| Interop | **HL7 FHIR R4** mapping | Hospital EHR exchange standard |
| Localization | In-house React-context i18n (EN/FR/AR/FA, RTL) | No dependency; offline-first; English fallback |

The domain model and FHIR mapping live in a framework-free package
(`packages/core`) so they can be reused by a future React Native client or the
backend sync service without change.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build to /dist
npm run preview    # serve the production build locally
```

`/dist` is a static bundle — deploy it to any static host (GitHub Pages, Netlify,
S3, nginx). The service worker makes it work offline after the first load.

## Project structure

A small npm-workspaces monorepo. Dependencies point inward — the UI and the
backend both depend on the framework-free core; nothing depends on the UI.

```
src/                       Field client (PWA)
  App.tsx                  Capture UI wiring everything together
  i18n.tsx                 In-house i18n (EN/FR/AR/FA + RTL, ?lang= switch)
  useNow.ts                Shared ticking clock for live elapsed time
  db/                      IndexedDB persistence (Dexie schema + repository)
  ehr/                     Browser-side EHR client (talks to the backend)
  components/              BodyChart, TriageBoard, CasualtySummary, Elapsed,
                           PcrVerify, EhrTestConsole, Tutorial, hints, …
packages/
  core/                    Framework-free: domain model, FHIR R4 mapping,
                           op-log sync, EHR port + Ontario mappings
  ehr-gateway/             Server-side EHR adapters (ONE ID, Ontario, Mock)
  sync-service/            Fastify + PostgreSQL: /sync + /ehr/* + audit
```

## What works today

- **Capture** — tombstone (identity), incident & START triage, age band
- **Anatomical body chart** — ~150 named anterior/posterior regions with tap-to-zoom;
  age-adjusted burn TBSA (Lund–Browder) computed live
- Per-injury severity, notes, and 📷 wound photos; timestamped vitals (with a GCS
  calculator); treatment log
- **Time-since-injury clock** (T+ elapsed) on the acuity glance, triage board, and card
- **Triage board** for multi-casualty scenes — grouped by triage, searchable, and
  filterable by on-scene / handed-over
- **Handover sign-off** — receiving clinician + facility, auto-timestamped; flows to the
  saved list, board, and casualty card
- Printable one-page **AT-MIST casualty card**; guided voiced onboarding tour
- **Identity & context** (via backend) — PCR `Patient/$match`, clinical-context pull,
  contribute-to-EHR, with an offline EHR Test Lab for QA
- **FHIR R4 export** — full bundle, plus a focused **handover slice** (Patient +
  Encounter + Provenance); a signed handover closes the Encounter and emits a Provenance
- **Multilingual UI** — English / French / Arabic / Persian, with right-to-left layout for
  Arabic & Persian; switch via the header 🌐 toggle or a `?lang=` URL parameter
  (e.g. `?lang=fa`) — the choice persists
- Offline persistence to IndexedDB; multiple casualties; auto-save
- **Backup / restore** — export every record to a single portable JSON file, or a
  **passphrase-encrypted** backup (AES-256-GCM); restore auto-detects which it is
- **Vault (opt-in)** — encrypt all casualty data **at rest** behind a passphrase: records,
  the op-log, and wound photos (AES-256-GCM), with a full-screen lock and auto-lock; the key
  lives only in memory while unlocked

## Roadmap

- Conflict-aware sync (op-log) wired from the client to the central service — see the architecture doc
- NFC/QR handover scan + master patient index reconciliation
- Auth (OAuth2/OIDC, SMART-on-FHIR), audit logging, RBAC (the opt-in vault already
  encrypts records, op-log, and photos at rest)
- Vitals trend mini-charts; scene-wide summary export for incident command

## Regulatory & security

This repository is a prototype. A production deployment processing real PHI must
address device classification (FDA SaMD / EU MDR if it influences clinical
decisions), privacy regime (HIPAA / GDPR), encryption in transit and at rest,
RBAC, and immutable audit logging. See the solution architecture document for the
full requirements.

## License

MIT — see [LICENSE](./LICENSE).
