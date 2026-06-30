// Data-driven anatomical region map. Every tappable region's geometry lives
// here as plain, serialisable parameters (box / ellipse / quad / finger / toe)
// so it can be EDITED — by hand or by the in-app calibrator (?calibrate=1) —
// without touching the build logic in body-model.ts. body-model.ts turns these
// specs into polygons (and mirrors image-left → image-right) via its helpers.
//
// Coordinates are SVG user space (BODY_VIEWBOX 480 x 1040), fitted to the figure
// images in public/figure/{anterior,posterior}.png. ORDER MATTERS: regionAt()
// returns the first region whose polygon contains the tap, so finer features are
// listed before the larger boxes they overlap.
import type { RegionGroup } from './body-model.js'

// `rot` (optional, degrees, clockwise about the shape's centre) lets a box or
// ellipse tilt to match angled features (eyes, ears, cheeks). Omitted/0 = axis
// aligned, so existing data is unchanged.
export type ShapeSpec =
  | { kind: 'box'; x1: number; y1: number; x2: number; y2: number; rot?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number }
  | { kind: 'quad'; cxTop: number; yTop: number; wTop: number; cxBot: number; yBot: number; wBot: number }
  // Free polygon: an explicit list of [x, y] vertices. Used by the calibrator to
  // trace irregular regions (and to back triangle / half-circle shapes), and for
  // hit-testing it's just another polygon.
  | { kind: 'polygon'; pts: Array<[number, number]> }

/** A single region. `name` for view-specific head parts; `names` for shared
 *  parts that are labelled differently on the anterior vs posterior view. */
export interface RegionSpec {
  name?: string
  names?: { ant: string; post: string }
  /** 'left' = authored on the image-left; mirrored to the right at build time. */
  side?: 'left'
  group: RegionGroup
  tbsa: number
  shape: ShapeSpec
}

/** One finger: a fan of 3 phalanx boxes down from the knuckle (root). */
export interface FingerSpec {
  label: string
  rootX: number
  rootY: number
  /** Degrees from straight-down, +x positive. */
  ang: number
  w: number
  lens: [number, number, number]
  tbsa: [number, number, number]
}

/** One toe: a small box hanging from the toe row. */
export interface ToeSpec {
  label: string
  cx: number
  w: number
  len: number
  yTop: number
}

/** Entries in the image-left list keep the exact build order; finger/toe groups
 *  expand inline where they appear (the hand digits sit between Wrist & Palm). */
export type LeftEntry =
  | RegionSpec
  | { fingers: FingerSpec[] }
  | { toes: ToeSpec[] }

export interface BodyRegionData {
  /** View-specific head/face regions. */
  head: { anterior: RegionSpec[]; posterior: RegionSpec[] }
  /** Centre-line shared parts (no side, same polygon both views). */
  central: RegionSpec[]
  /** Image-left shared parts, mirrored to the right at build time. */
  left: LeftEntry[]
}

const box = (x1: number, y1: number, x2: number, y2: number): ShapeSpec => ({ kind: 'box', x1, y1, x2, y2 })
const ell = (cx: number, cy: number, rx: number, ry: number): ShapeSpec => ({ kind: 'ellipse', cx, cy, rx, ry })
const quad = (cxTop: number, yTop: number, wTop: number, cxBot: number, yBot: number, wBot: number): ShapeSpec =>
  ({ kind: 'quad', cxTop, yTop, wTop, cxBot, yBot, wBot })

/** The canonical region map. Edit these numbers (or the calibrator) to refit. */
export const BODY_REGION_DATA: BodyRegionData = {
  head: {
    // Anterior face — fine features first so overlaps resolve to them.
    anterior: [
      { name: 'Eye', side: 'left', group: 'face', tbsa: 0.3, shape: ell(226, 160, 13, 8) },
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, shape: ell(201, 170, 9, 18) },
      { name: 'Nose', group: 'face', tbsa: 0.3, shape: box(232, 156, 248, 183) },
      { name: 'Mouth', group: 'face', tbsa: 0.3, shape: box(224, 185, 256, 199) },
      { name: 'Cheek', side: 'left', group: 'face', tbsa: 0.6, shape: box(202, 166, 229, 200) },
      { name: 'Chin', group: 'face', tbsa: 0.4, shape: box(218, 199, 262, 222) },
      { name: 'Forehead', group: 'face', tbsa: 1, shape: box(200, 140, 280, 154) },
      { name: 'Crown', group: 'head', tbsa: 1, shape: box(202, 108, 278, 140) },
    ],
    // Posterior head — ear first (and at true ear level).
    posterior: [
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, shape: ell(200, 170, 8, 17) },
      { name: 'Posterior scalp', group: 'head', tbsa: 1.5, shape: box(206, 113, 274, 162) },
      { name: 'Occiput', group: 'head', tbsa: 2, shape: box(204, 162, 276, 210) },
      { name: 'Nape', group: 'neck', tbsa: 0.5, shape: box(220, 210, 260, 233) },
    ],
  },
  central: [
    { names: { ant: 'Anterior neck', post: 'Posterior neck' }, group: 'neck', tbsa: 0.5, shape: box(220, 224, 260, 256) },
    { names: { ant: 'Upper abdomen', post: 'Mid back' }, group: 'trunk', tbsa: 3, shape: box(184, 392, 296, 452) },
    { names: { ant: 'Lower abdomen', post: 'Lower back' }, group: 'trunk', tbsa: 3, shape: box(192, 452, 288, 506) },
  ],
  left: [
    { names: { ant: 'Shoulder', post: 'Shoulder' }, side: 'left', group: 'arm', tbsa: 2, shape: box(150, 250, 202, 300) },
    { names: { ant: 'Chest', post: 'Upper back' }, side: 'left', group: 'trunk', tbsa: 4.5, shape: box(176, 258, 240, 392) },
    { names: { ant: 'Pelvis', post: 'Buttock' }, side: 'left', group: 'trunk', tbsa: 2, shape: box(196, 506, 240, 560) },
    { names: { ant: 'Upper arm', post: 'Upper arm' }, side: 'left', group: 'arm', tbsa: 2, shape: quad(146, 300, 50, 90, 432, 40) },
    { names: { ant: 'Elbow', post: 'Elbow' }, side: 'left', group: 'arm', tbsa: 0.5, shape: quad(90, 432, 40, 80, 458, 38) },
    { names: { ant: 'Forearm', post: 'Forearm' }, side: 'left', group: 'arm', tbsa: 1.5, shape: quad(80, 458, 36, 52, 498, 32) },
    { names: { ant: 'Wrist', post: 'Wrist' }, side: 'left', group: 'arm', tbsa: 0.3, shape: quad(52, 498, 30, 48, 510, 28) },
    // Hand digits (before Palm so a base tap resolves to the digit).
    { names: { ant: 'Thumb proximal', post: 'Thumb proximal' }, side: 'left', group: 'hand', tbsa: 0.1, shape: box(33, 503, 53, 525) },
    { names: { ant: 'Thumb distal', post: 'Thumb distal' }, side: 'left', group: 'hand', tbsa: 0.1, shape: box(14, 521, 37, 546) },
    { fingers: [
      { label: 'Index', rootX: 38, rootY: 524, ang: -17, w: 9, lens: [11, 9, 7], tbsa: [0.06, 0.05, 0.05] },
      { label: 'Middle', rootX: 47, rootY: 525, ang: -7, w: 9, lens: [14, 11, 9], tbsa: [0.06, 0.05, 0.05] },
      { label: 'Ring', rootX: 56, rootY: 524, ang: -2, w: 9, lens: [11, 9, 7], tbsa: [0.06, 0.05, 0.05] },
      { label: 'Little', rootX: 63, rootY: 521, ang: 3, w: 8, lens: [8, 6, 5], tbsa: [0.06, 0.05, 0.05] },
    ] },
    { names: { ant: 'Palm', post: 'Back of hand' }, side: 'left', group: 'hand', tbsa: 0.5, shape: box(34, 494, 80, 524) },
    // Leg — converges medially; knee centred on the patella.
    { names: { ant: 'Thigh', post: 'Thigh' }, side: 'left', group: 'leg', tbsa: 4.5, shape: quad(205, 512, 76, 196, 720, 52) },
    { names: { ant: 'Knee', post: 'Back of knee' }, side: 'left', group: 'leg', tbsa: 0.5, shape: box(174, 724, 220, 766) },
    { names: { ant: 'Shin', post: 'Calf' }, side: 'left', group: 'leg', tbsa: 3, shape: quad(196, 766, 48, 189, 856, 34) },
    { names: { ant: 'Ankle', post: 'Ankle' }, side: 'left', group: 'leg', tbsa: 0.5, shape: box(171, 856, 207, 884) },
    { names: { ant: 'Foot dorsum', post: 'Sole' }, side: 'left', group: 'foot', tbsa: 1, shape: box(150, 884, 204, 908) },
    { toes: [
      { label: 'Great toe', cx: 194, w: 13, len: 16, yTop: 908 },
      { label: '2nd toe', cx: 182, w: 10, len: 15, yTop: 908 },
      { label: '3rd toe', cx: 172, w: 9, len: 14, yTop: 908 },
      { label: '4th toe', cx: 163, w: 9, len: 13, yTop: 908 },
      { label: '5th toe', cx: 155, w: 8, len: 11, yTop: 908 },
    ] },
  ],
}
