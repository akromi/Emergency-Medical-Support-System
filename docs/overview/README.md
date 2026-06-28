# TRIAGE-LINK — capability overview deck

A 20-slide presentation of the whole system: the offline-first PWA, the
encryption & audit layer, the multi-tenant backend + admin security, and the
three market flavors (Humanitarian / NGO · Ontario EMS / regulated · productized
backend).

## Files

| File | What it is |
|---|---|
| `triage-link-overview.html` | **Canonical deck** — brand-themed, keyboard-navigable. Open in any browser; `←` / `→` (or space) to navigate; auto-scales to the window. References the screenshots in `img/`, so keep that folder alongside it. |
| `triage-link-overview.pdf` | Self-contained handout (22 pages, screenshots baked in) — produced from the HTML via the bundled Chromium. The single file to email/share. |
| `img/app-*.png` | Real screenshots of the running PWA (record · summary card · triage board). |

Both decks are generated — edit the source script, don't hand-edit the outputs.

## Regenerate

The content lives as plain data in `gen_html.py` (the slide list near the bottom).
After editing it:

```bash
# 1. rebuild the HTML deck
python3 docs/overview/gen_html.py

# 2. re-render the PDF from that HTML (uses the repo's Chromium via @playwright/test)
node docs/overview/render_pdf.mjs
```

`render_pdf.mjs` points Playwright at the pre-installed browser
(`/opt/pw-browsers/chromium`); locally without that path, drop the
`executablePath` option or run `npx playwright install chromium` first.

### Re-capturing the screenshots

The shots in `img/` come from the real app. To refresh them, build + serve the
PWA and drive it with Playwright:

```bash
npm run build && npm run preview -- --port 4178 --strictPort &
# then a short Playwright script: populate a record (pick an injury type, drop a
# marker, set triage, record a vital) and screenshot the record, the Summary
# card (.summary-sheet), and the Triage Board (.board) into docs/overview/img/.
```

## Optional: editable PowerPoint

`build_deck.py` emits the same content as a native `.pptx` (editable in
PowerPoint / Keynote / Google Slides). It needs `python-pptx`:

```bash
pip install python-pptx
python3 docs/overview/build_deck.py   # writes TRIAGE-LINK-overview.pptx here
```

The `.pptx` is not committed (it's a regenerable binary); the HTML + PDF are the
canonical artifacts.

## Theme

Colors and type mirror the app (`src/styles.css`): dark medical UI, signature
EKG-green (`#3FE08A`) accent, amber for the backend/admin track, blue for the
EHR / regulated track.
