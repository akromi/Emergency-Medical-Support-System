# Region calibrator

A developer/maintenance tool for fitting the body-chart **tap regions** to the
figure images pixel-perfectly. It is **not** part of the field casualty workflow,
so it stays out of the guided tour — but its UI, tooltips, and help guide follow
the selected app language (English / French / Arabic / Persian, RTL included).

> **In-app help:** everything below is also available inside the tool — click the
> **❓ Help** button in the toolbar for a contextual cheat-sheet, and hover any
> control for a tooltip describing what it does.

## Open it

The calibrator lives inside the **gated Admin area** — there is no bare
`?calibrate=1` URL. To reach it:

1. Sign in as an operator with the **admin** role (Operators menu → add/select an
   admin; set a PIN to require step-up).
2. Open the **🛠 Admin** menu entry (admin-only; prompts for the step-up PIN).
3. Choose **Region calibrator**.

This keeps it off field/fresh devices and out of the guided tour. (On a brand-new
device with no operators yet, create an admin operator first — operator setup is
bootstrap-open.)

## Get around

1. **Pick a region** from the dropdown — the view **zooms to it** so the handles
   are big and easy to drag (toggle the *Zoom* button for the whole body).
2. **View** flips anterior (front) / posterior (back). **Recenter** re-frames the
   view on the selection if it drifts off-screen.
3. You edit the image-**left** / centre / head regions; the **right side mirrors
   automatically** on every change.

## Reshape a region

Drag the handles onto the figure:

- **Blue ring** — move the whole region (it always sits at the region's centre).
- **Amber dots** — reshape. **Boxes** have four corners **+ four edge midpoints**
  (8 anchors, for irregular boxes like a thigh); **ellipses** have radius handles;
  **quads** (limb segments) have four corners; **fingers** have root / tip / width;
  **toes** have top-centre + a corner.
- **Green +** — on a **polygon**, insert a vertex on that edge, then drag it.
  **− point** removes the selected vertex (kept at ≥ 3).

Or use the **Move / Width / Height / Rotate** buttons with a 1- or 5-unit **Step**
for precise, tap-based adjustment — the figure holds still while you work.

## Shapes

The **Shape** menu converts the selected region between **rectangle / circle /
oval / triangle / half-circle / free polygon**, preserving its footprint. Triangle
and half-circle are stored as polygons, so they hit-test and mirror like any other.

## Add / duplicate / split / delete regions

- **＋ Add region** drops a new box at the view centre, selected and ready.
- **Duplicate** copies the selected region; **Split** halves it (top/bottom or
  left/right) — the seed for e.g. tracing the nose as a *triangle + a rectangle*;
  **Delete** removes it.
- The **Name / Group / TBSA% / Mirror** fields edit the selected region. Region
  **names** drive burn-TBSA, so renaming changes the math; moving/reshaping does not.

## Overlapping regions (priority)

`regionAt()` returns the region with the highest **priority** under the tap (a
stable sort, so equal priority falls back to the authored order). In the editor:

- **⤒ Front** wins every overlap in the view; **⤓ Back** loses to all; **↑ / ↓**
  nudge by one. This works **across groups** — a centre/limb region can be made to
  win against a head region, or vice-versa. `0` = default authored order.

**Undo** (toolbar button or **Ctrl/⌘+Z**) steps back one edit at a time — each
button tap is one step, and a whole handle drag is one step.

## Save / export

**Workshop-only:** the calibrator never changes the live field chart. The normal
app always renders the shipped default — a saved calibration is *not* applied on
startup. This keeps a field tablet from ever silently using non-default injury
geometry.

- **Save** persists your in-progress edits to `localStorage` so reopening the tool
  resumes them. It only affects the calibrator (the live preview is applied solely
  while the tool is mounted, and reset on exit).
- **Export JSON** downloads `body-regions.data.json` — the full corrected map.
- **Reset to built-in** clears the saved edits and returns to the shipped map.

## Make it the default for everyone

The shipped default lives in
[`packages/core/src/domain/body-regions.data.ts`](../packages/core/src/domain/body-regions.data.ts)
(`BODY_REGION_DATA`). To roll your calibration out to all users, copy the numbers
from the exported JSON into that file and commit. `body-model.ts` builds the
polygons from it, so nothing else changes. The `regions.test.ts` coordinate
assertions may need updating to match the new positions.

## How it fits together

- `body-regions.data.ts` – the serialisable region map (the single place to edit);
  each region carries an optional `shape`, `priority`, `side`, `group`, `tbsa`.
- `body-model.ts` – `buildRegions(data, view)` (pure, used for the live preview),
  `applyRegionData(data | null)` (runtime override used by the tool **only**, while
  it is mounted), the priority-aware sort, and the usual `bodyRegions` / `zoneAt` /
  `regionAt`.
- `src/components/RegionCalibrator.tsx` – the calibrator UI (including the **❓ Help**
  panel and per-control tooltips).
