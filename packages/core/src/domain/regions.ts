import type { BodyView } from './types.js'
import { bodyRegions, BODY_VIEWBOX, type Point } from './body-model.js'

// Anatomical hit-testing over the body model (body-model.ts). The model's region
// polygons are both drawn by the body chart and tested here, so the figure and
// the tappable regions never drift. `regionAt(x, y, view)` keeps its original
// signature and return shape (anatomical side prefix + region name), so nothing
// upstream changes — it is the single seam.

/** Ray-casting point-in-polygon test. */
function inPolygon(x: number, y: number, poly: ReadonlyArray<Point>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// Anatomical position: anterior view -> image-left is the patient's RIGHT.
// Posterior view flips it.
function anatomicalSide(side: 'left' | 'right' | undefined, view: BodyView): string {
  if (!side) return ''
  if (view === 'anterior') return side === 'left' ? 'R ' : 'L '
  return side === 'left' ? 'L ' : 'R '
}

export function regionAt(x: number, y: number, view: BodyView): string {
  for (const region of bodyRegions(view)) {
    if (inPolygon(x, y, region.points)) return anatomicalSide(region.side, view) + region.name
  }
  // Coarse vertical-band fallback when the tap lands outside the silhouette.
  // Bands follow the figure's pose (head ~y113-235, trunk ~235-560, legs below).
  const { height } = BODY_VIEWBOX
  if (y < height * 0.23) return 'Head'
  if (y < height * 0.38) return 'Chest'
  if (y < height * 0.44) return 'Abdomen'
  if (y < height * 0.54) return 'Pelvis'
  return x < BODY_VIEWBOX.width / 2 ? 'Left lower limb' : 'Right lower limb'
}
