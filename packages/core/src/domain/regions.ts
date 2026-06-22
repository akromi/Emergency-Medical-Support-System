import type { BodyView } from './types.js'

// Anatomical hit-test model over the body-chart's SVG user space (viewBox
// 0 0 220 440). Regions are polygons that trace the silhouette drawn by
// BodyChart (head circle, tapered arms/legs, curved torso) rather than coarse
// axis-aligned rectangles, so a marker resolves to the region whose anatomy
// actually contains it. `regionAt(x, y, view)` keeps its original signature and
// return shape, so nothing upstream changes.

type Side = 'left' | 'right'
type Point = readonly [number, number]

interface RegionPoly {
  name: string
  /** Side of the *image* (anterior: image-left = patient's right). */
  side?: Side
  points: ReadonlyArray<Point>
}

// Polygons in image order (clockwise). Ordered most-specific/peripheral first so
// overlapping joints (e.g. shoulder vs. upper-arm root) resolve to the joint.
const REGIONS: ReadonlyArray<RegionPoly> = [
  { name: 'Head', points: [[110, 17], [128, 26], [137, 44], [128, 62], [110, 71], [92, 62], [83, 44], [92, 26]] },
  { name: 'Neck', points: [[98, 66], [122, 66], [122, 82], [98, 82]] },

  { name: 'Shoulder', side: 'left', points: [[66, 86], [92, 84], [90, 106], [64, 104]] },
  { name: 'Shoulder', side: 'right', points: [[128, 84], [154, 86], [156, 104], [130, 106]] },

  { name: 'Upper arm', side: 'left', points: [[70, 88], [50, 110], [45, 160], [66, 160]] },
  { name: 'Upper arm', side: 'right', points: [[150, 88], [170, 110], [175, 160], [154, 160]] },
  { name: 'Forearm', side: 'left', points: [[45, 160], [66, 160], [62, 205], [47, 205]] },
  { name: 'Forearm', side: 'right', points: [[154, 160], [175, 160], [173, 205], [158, 205]] },
  { name: 'Hand', side: 'left', points: [[46, 205], [62, 205], [58, 232], [42, 228]] },
  { name: 'Hand', side: 'right', points: [[158, 205], [174, 205], [178, 228], [162, 232]] },

  { name: 'Chest', points: [[70, 84], [150, 84], [156, 150], [64, 150]] },
  { name: 'Abdomen', points: [[64, 150], [156, 150], [148, 195], [72, 195]] },
  { name: 'Pelvis', points: [[72, 195], [148, 195], [142, 232], [78, 232]] },

  { name: 'Thigh', side: 'left', points: [[80, 232], [104, 232], [106, 330], [80, 330]] },
  { name: 'Thigh', side: 'right', points: [[116, 232], [140, 232], [140, 330], [114, 330]] },
  { name: 'Lower leg', side: 'left', points: [[80, 330], [106, 330], [99, 410], [85, 410]] },
  { name: 'Lower leg', side: 'right', points: [[114, 330], [140, 330], [135, 410], [121, 410]] },
  { name: 'Foot', side: 'left', points: [[78, 410], [106, 410], [104, 428], [79, 428]] },
  { name: 'Foot', side: 'right', points: [[114, 410], [142, 410], [141, 428], [117, 428]] },
]

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
function anatomicalSide(side: Side | undefined, view: BodyView): string {
  if (!side) return ''
  if (view === 'anterior') return side === 'left' ? 'R ' : 'L '
  return side === 'left' ? 'L ' : 'R '
}

export function regionAt(x: number, y: number, view: BodyView): string {
  for (const r of REGIONS) {
    if (inPolygon(x, y, r.points)) return anatomicalSide(r.side, view) + r.name
  }
  // Fallback by vertical band when the point falls outside the silhouette.
  if (y < 72) return 'Head'
  if (y < 150) return 'Chest'
  if (y < 200) return 'Abdomen'
  if (y < 240) return 'Pelvis'
  return x < 110 ? 'Left lower limb' : 'Right lower limb'
}

// ---- Burn TBSA estimation -------------------------------------------------
// Per-region share of total body surface area for ONE aspect (the marked
// view). Adult values aligned with the Wallace "rule of nines" / Lund-Browder
// breakdown; the front and back aspects each total ~50%. These are clinical
// estimates, not exact measurements.
export const REGION_TBSA: Readonly<Record<string, number>> = {
  Head: 4.5,
  Neck: 0.5,
  Chest: 9,
  Abdomen: 6,
  Pelvis: 3,
  Shoulder: 0.75,
  'Upper arm': 2,
  Forearm: 1.5,
  Hand: 1,
  Thigh: 4.5,
  'Lower leg': 3,
  Foot: 1.5,
  // Coarse fallback regions (whole limb, one aspect).
  'Left lower limb': 9,
  'Right lower limb': 9,
}

/** TBSA % for a single burned region's marked aspect (side prefix ignored). */
export function regionTBSA(region: string): number {
  const base = region.replace(/^[LR]\s+/, '')
  return REGION_TBSA[base] ?? 0
}

/**
 * Estimate total burn surface area from marked injuries (rule-of-nines style).
 * Only `burn` injuries count; each distinct region+view is counted once (extra
 * markers in the same area don't inflate the total), so anterior and posterior
 * of the same region add up, and left/right sides count separately. Capped at
 * 100%.
 */
export function estimateBurnTBSA(
  injuries: ReadonlyArray<{ type: string; region: string; view: BodyView }>,
): number {
  const counted = new Set<string>()
  let total = 0
  for (const inj of injuries) {
    if (inj.type !== 'burn') continue
    const key = `${inj.view}|${inj.region}`
    if (counted.has(key)) continue
    counted.add(key)
    total += regionTBSA(inj.region)
  }
  return Math.min(100, Math.round(total * 10) / 10)
}
