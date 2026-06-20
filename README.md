# TRIAGE-LINK

> Offline-first Progressive Web App for casualty care & transport documentation.
> Field responders capture patient identity, injuries on a 2-D body chart, vitals,
> and treatments — then export a FHIR bundle for hospital handover.

> ⚠️ **Prototype — not a medical device and not for clinical use.** See _Regulatory_ below.

## Why these technologies (portability first)

A PWA is the most portable target available: it runs on any device with a modern
browser, installs to the home screen, works fully offline, and deploys as static
files to any host or CDN — one codebase, no per-platform builds.

| Concern | Choice | Why |
|---|---|---|
| Client | **PWA** (React + TypeScript + Vite) | Runs anywhere; installable; offline-capable |
| Offline storage | **IndexedDB** via **Dexie** | Durable on-device store, no backend required |
| Offline shell | **vite-plugin-pwa** (Workbox) | Service worker caches the app for offline use |
| Domain logic | Framework-free **TypeScript** core | Reusable; single source of truth |
| Interop | **HL7 FHIR** mapping | Hospital EHR exchange standard |

The domain model (`src/domain`) and FHIR mapping (`src/fhir`) are deliberately
framework-free so they can be reused by a future React Native client or a backend
sync service without change.

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

```
src/
  domain/      Framework-free model: types, injury catalog, body regions, IDs
  fhir/        FHIR R4 mapping (CasualtyRecord -> Bundle) + minimal FHIR types
  db/          IndexedDB persistence (Dexie schema + repository)
  components/  BodyChart — interactive anterior/posterior injury marking
  App.tsx      Capture UI wiring everything together
```

## What works today

- Tombstone (identity), incident & START triage
- Interactive anterior/posterior body chart with auto-detected body region
- Severity + notes per injury; vitals (timestamped); treatment log
- Offline persistence to IndexedDB; multiple casualties; auto-save
- **Export FHIR ↓** — downloads a FHIR R4 Bundle for the current casualty

## Roadmap

- Conflict-aware sync (op-log) to a central service — see the architecture doc
- Anatomical body chart (burn TBSA, named bones) replacing rectangular regions
- NFC/QR handover scan + master patient index reconciliation
- Auth (OAuth2/OIDC, SMART-on-FHIR), audit logging, encryption at rest

## Regulatory & security

This repository is a prototype. A production deployment processing real PHI must
address device classification (FDA SaMD / EU MDR if it influences clinical
decisions), privacy regime (HIPAA / GDPR), encryption in transit and at rest,
RBAC, and immutable audit logging. See the solution architecture document for the
full requirements.

## License

MIT — see [LICENSE](./LICENSE).
