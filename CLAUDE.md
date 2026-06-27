# Contributor guide (for Claude & humans)

TRIAGE-LINK — offline-first PWA for field casualty documentation. npm-workspaces
monorepo: the root PWA plus `packages/core` (framework-free domain + FHIR +
op-log), `packages/sync-service` (Fastify), `packages/ehr-gateway`.

## Rules

- **Tutorial parity.** Any user-visible / visual change — a new panel, control,
  button, screen, or a moved/renamed one — MUST update the guided tour in the
  same change: the step list in `src/components/Tutorial.tsx` and the `tour.*`
  narration strings in **every** language. If a change adds a feature the user
  interacts with, the tour should tell them it exists and how to use it.

- **i18n is four languages, always in sync.** Every UI string lives in
  `src/i18n.tsx` as `en` / `fr` / `ar` / `fa` dictionaries. Add a key to one and
  you add it to all four — a parity test (`test/i18n.test.ts`) fails otherwise.
  Arabic and Persian are RTL; keep wording natural, not literal.

- **Default-off for risky features.** Opt-in capabilities (e.g. the encryption
  vault) must leave existing behaviour and the whole test suite unchanged when
  off.

- **Verify before claiming done.** Run `npm run typecheck`, `npm run test:report`,
  `npm run build`, and the Playwright e2e suite. Don't report green without the
  output.

## Commands

```bash
npm run dev            # Vite dev server
npm run typecheck      # type-check root + all workspaces
npm run test:app       # PWA unit/integration tests (vitest + fake-indexeddb)
npm run test:report    # all workspaces
npm run build          # production build to /dist
npm run test:e2e       # Playwright (Chromium) — see playwright.config.ts
```

## Where things live

- `src/db/` — IndexedDB via Dexie: `database.ts` (schema), `repository.ts`
  (record CRUD + op-log journaling), `oplog.ts`, `photos.ts`, `crypto.ts`
  (WebCrypto AES-GCM/PBKDF2), `vault.ts` + `record-crypto.ts` (opt-in at-rest
  encryption of records, op-log, photos), `backup.ts` (plain + encrypted).
- `src/components/` — `BodyChart`, `TriageBoard`, `SceneSummary`,
  `CasualtySummary`, `VitalsTrend`, `Tutorial`, `VaultLock`, …
- `docs/` — architecture/roadmap markdown; the `.html`/`.pdf` exports are
  regenerated via `scripts/` (see `scripts/README.md`).

## Docs are generated

`docs/*.pdf` and the bespoke `*.html` are produced by `scripts/print-pdf.mjs`
(HTML→PDF) and `scripts/md-to-pdf.mjs` (Markdown+mermaid→PDF). When you change a
doc's content, regenerate its PDF rather than hand-editing it.
