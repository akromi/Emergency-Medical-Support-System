# Documentation PDF generation

The `docs/` PDFs are rendered with headless Chromium (via `playwright-core`,
already a dev dependency). Set `CHROMIUM_PATH` if your Playwright browser build
differs from the default.

## Bespoke HTML docs → PDF

`docs/triage-link-architecture-merged.html` and `docs/triage-link-deployment.html`
are hand-authored, self-contained HTML (inline CSS + SVG diagrams). Re-export with:

```bash
node scripts/print-pdf.mjs docs/triage-link-architecture-merged.html docs/triage-link-architecture-merged.pdf
```

## Markdown (+ mermaid) docs → PDF

`docs/MASTER-ARCHITECTURE.md` and `docs/CERTIFICATION-ROADMAP.md` render through
`marked` + `mermaid`, which are **not** repo dependencies — install them into a
throwaway prefix and point `RENDERER_DIR` at it:

```bash
mkdir -p /tmp/md-renderer && (cd /tmp/md-renderer && npm init -y && npm install marked@12 mermaid@11)
RENDERER_DIR=/tmp/md-renderer node scripts/md-to-pdf.mjs \
  docs/MASTER-ARCHITECTURE.md docs/MASTER-ARCHITECTURE.pdf "TRIAGE-LINK — Master Architecture"
RENDERER_DIR=/tmp/md-renderer node scripts/md-to-pdf.mjs \
  docs/CERTIFICATION-ROADMAP.md docs/CERTIFICATION-ROADMAP.pdf "TRIAGE-LINK — Certification Roadmap"
```
