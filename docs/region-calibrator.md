# Region calibrator

A developer/maintenance tool for fitting the body-chart **tap regions** to the
figure images pixel-perfectly. It is **not** part of the field casualty workflow,
so it is intentionally English-only and absent from the guided tour.

## Open it

Append `?calibrate=1` to the app URL (e.g. `http://localhost:5173/?calibrate=1`,
or the deployed URL on a tablet). The normal app is unaffected without the flag.

## Use it

1. Pick a region from the dropdown (or it shows all regions overlaid in red).
2. Drag the round handles onto the figure:
   - **boxes** – four corner handles + a centre (move) handle;
   - **ellipses** (eye/ear) – centre + an east (radius-x) + a south (radius-y) handle;
   - **quads** (limb segments) – four corner handles + centre;
   - **fingers** – root (move), tip (sets angle + length), and a width handle;
   - **toes** – top-centre (move) + a bottom-right corner handle.
3. You edit the image-**left** / centre / head regions; the **right side mirrors
   automatically** on every change. Switch anterior/posterior with the *View* button.

## Save it

- **Save** writes the edited map to `localStorage` (`tl.regions.override`). Reload
  the app (without the flag) and the **live chart uses your calibration** on this
  device — a per-device override.
- **Export JSON** downloads `body-regions.data.json` — the full corrected map.

## Make it the default for everyone

The shipped default lives in
[`packages/core/src/domain/body-regions.data.ts`](../packages/core/src/domain/body-regions.data.ts)
(`BODY_REGION_DATA`). To roll your calibration out to all users, copy the numbers
from the exported JSON into that file and commit. `body-model.ts` builds the
polygons from it, so nothing else changes. The `regions.test.ts` coordinate
assertions may need updating to match the new positions.

## How it fits together

- `body-regions.data.ts` – the serialisable region map (the single place to edit).
- `body-model.ts` – `buildRegions(data, view)` (pure, used for the live preview),
  `applyRegionData(data | null)` (runtime override used by the tool and by app
  startup to apply a saved calibration), and the usual `bodyRegions` / `zoneAt` /
  `regionAt`.
- `src/components/RegionCalibrator.tsx` – the `?calibrate=1` UI.
