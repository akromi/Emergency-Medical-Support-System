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
  /** Overlap precedence. regionAt() returns the first region under a tap; the
   *  builder sorts regions by `priority` (higher first) before hit-testing, so a
   *  higher value wins overlaps even ACROSS groups (head vs limb). Default 0
   *  keeps the authored order (a stable sort), so existing data is unchanged. */
  priority?: number
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
  /** Degrees (clockwise) to rotate the toe about its root (cx, yTop). */
  ang?: number
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
// (No quad() helper: the current map uses none. The 'quad' ShapeSpec kind above
// stays supported — inline `{ kind: 'quad', … }` if a future calibration needs it.)

/** The canonical region map. Edit these numbers (or the calibrator) to refit. */
export const BODY_REGION_DATA: BodyRegionData = {
  head: {
    anterior: [
      { name: "Eye", side: 'left', group: 'face', tbsa: 0.3, shape: ell(226.4, 157.4, 9, 4.4) },
      { name: "Ear", side: 'left', group: 'face', tbsa: 0.4, shape: { kind: 'ellipse', cx: 206.2, cy: 173.7, rx: 4.5, ry: 14.1, rot: -9 } },
      { name: "Nose", group: 'face', tbsa: 0.3, shape: { kind: 'polygon', pts: [[237.4, 158.7], [238.7, 155.3], [240.9, 153.4], [242.5, 155.4], [244, 157.3], [248.2, 167], [252.1, 177.3], [229, 177.9], [232.7, 167.7] ] } },
      { name: "Mouth", group: 'face', tbsa: 0.3, shape: box(224.6, 180.7, 255, 191.3) },
      { name: "Cheek", side: 'left', group: 'face', tbsa: 0.6, shape: box(210.6, 164.4, 226.4, 203.2) },
      { name: "Chin", group: 'face', tbsa: 0.4, shape: box(219, 192, 265.6, 207.9) },
      { name: "Forehead", group: 'face', tbsa: 1, shape: box(205.4, 140.3, 276.4, 151.2) },
      { name: "Crown", group: 'head', tbsa: 1, shape: { kind: 'polygon', pts: [[274.6, 138.9], [240.5, 140], [205.3, 140.5], [205.3, 140.5], [207.3, 132.9], [211.5, 125.3], [218.7, 104], [227.7, 104], [241.2, 104], [248.7, 104], [259, 104], [267.1, 104], [272.6, 128.8], [274.6, 138.9] ] } },
    ],
    posterior: [
      { name: "Ear", side: 'left', group: 'face', tbsa: 0.4, shape: { kind: 'ellipse', cx: 205.2, cy: 174.7, rx: 5.8, ry: 11.9, rot: -19 } },
      { name: "Posterior scalp", group: 'head', tbsa: 1.5, shape: { kind: 'polygon', pts: [[219.5, 104], [246, 104], [264, 104], [272.4, 134.8], [274, 162], [206, 162], [206.7, 138] ] } },
      { name: "Occiput", group: 'head', tbsa: 2, shape: box(195, 152.2, 284, 203.5) },
      { name: "Nape", group: 'neck', tbsa: 0.5, shape: box(202.4, 208.3, 278.4, 255.3) },
    ],
  },
  central: [
    { names: { ant: "Anterior neck", post: "Posterior neck" }, group: 'neck', tbsa: 0.5, shape: box(199.1, 178.8, 280.9, 272) },
    { names: { ant: "Upper abdomen", post: "Mid back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[151.4, 334.3], [335.7, 333], [318.6, 390.5], [317.5, 441.9], [161.2, 437.5], [159.7, 391.5] ] } },
    { names: { ant: "Lower abdomen", post: "Lower back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[160.2, 421], [319.6, 421], [320.9, 476.4], [289.9, 468.4], [271.2, 472.2], [240.7, 487.3], [207.7, 470], [188.2, 461.5], [166.4, 466] ] } },
    { names: { ant: "Groin", post: "Perineum" }, group: 'trunk', tbsa: 1, shape: { kind: 'polygon', pts: [[221.5, 510.4], [255.8, 512], [254.5, 538.3], [243.1, 545.7], [235.4, 545.9], [224.9, 533.1] ] } },
  ],
  left: [
    { names: { ant: "Shoulder", post: "Shoulder" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[131.2, 248.3], [157.4, 235.3], [221.9, 208.9], [224.7, 265.7], [181.7, 267.2], [174.4, 278.9], [179.5, 304.6], [103.3, 315.1] ] } },
    { names: { ant: "Chest", post: "Upper back" }, side: 'left', group: 'trunk', tbsa: 4.5, shape: box(154, 246, 250, 355.3) },
    { names: { ant: "Pelvis", post: "Buttock" }, side: 'left', group: 'trunk', tbsa: 2, shape: { kind: 'polygon', pts: [[183.7, 442.2], [206.8, 441.2], [223.6, 451.1], [240.5, 467.2], [253.9, 491.5], [251.5, 527.2], [238.6, 560.2], [193.9, 572], [162.3, 543.8], [153.5, 494.2], [162.7, 460.7] ] } },
    { names: { ant: "Upper arm", post: "Upper arm" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[114.8, 297.7], [182.9, 276.7], [183.3, 305.3], [181.2, 329.1], [172.5, 344.9], [158.6, 373.2], [95.8, 360], [102.2, 343.9], [106.9, 325.9], [112.3, 318.2], [112.1, 316.7] ] } },
    { names: { ant: "Elbow", post: "Elbow" }, side: 'left', group: 'arm', tbsa: 0.5, shape: { kind: 'polygon', pts: [[105.5, 337.2], [168.9, 355.4], [154.9, 375.7], [151.3, 381.8], [144.5, 408.6], [67.1, 393.5], [91.5, 366.2] ] } },
    { names: { ant: "Forearm", post: "Forearm" }, side: 'left', group: 'arm', tbsa: 1.5, shape: { kind: 'polygon', pts: [[81.6, 372], [158.7, 387.1], [93.9, 489.6], [42.9, 473.7] ] } },
    { names: { ant: "Wrist", post: "Wrist" }, side: 'left', group: 'arm', tbsa: 0.3, shape: { kind: 'polygon', pts: [[54.7, 451.9], [102, 468.1], [88.6, 505.6], [60, 501.7], [36, 480.3] ] } },
    { names: { ant: "Thumb proximal", post: "Thumb proximal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[15.5, 481.7], [54.3, 460.8], [65.3, 474.9], [79, 491.7], [32.5, 512.4] ] } },
    { names: { ant: "Thumb distal", post: "Thumb distal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[1.2, 494.1], [9.7, 492], [11.7, 489.4], [34.6, 469], [54.7, 500.9], [35.2, 514.1], [27, 520.3], [10.7, 523.3], [-6.4, 512.2] ] } },
    { fingers: [
      { label: "Index", rootX: 34.1, rootY: 517.1, ang: -33.1, w: 9, lens: [15.4, 12.4, 10.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Middle", rootX: 42, rootY: 523.4, ang: -24, w: 9, lens: [16.8, 13.1, 11.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Ring", rootX: 51.5, rootY: 526, ang: -16.1, w: 9, lens: [15.2, 12, 10], tbsa: [0.06, 0.05, 0.05] },
      { label: "Little", rootX: 62.8, rootY: 525.3, ang: -10.3, w: 7.9, lens: [12.1, 9.7, 7.7], tbsa: [0.06, 0.05, 0.05] },
    ] },
    { names: { ant: "Palm", post: "Back of hand" }, side: 'left', group: 'hand', tbsa: 0.5, shape: { kind: 'polygon', pts: [[29.2, 489.4], [59.2, 472.8], [73.2, 479.9], [76.6, 480.6], [95.5, 477.2], [90, 509.7], [83.1, 522.2], [75.2, 536.2], [62.5, 538.1], [45.2, 536.7], [15.7, 523.8], [19.4, 502.1] ] } },
    { names: { ant: "Knee", post: "Back of knee" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[156.4, 651.1], [232.7, 648.8], [226, 690.2], [212.7, 724.1], [147.8, 722.1] ] } },
    { names: { ant: "Thigh", post: "Thigh" }, side: 'left', group: 'leg', tbsa: 4.5, shape: { kind: 'polygon', pts: [[154.7, 483.2], [199.7, 550.3], [218.8, 545.5], [253.4, 517.8], [226.8, 682.7], [191.3, 675.6], [152.2, 676.7], [138, 603.4], [140.5, 551.4] ] } },
    { names: { ant: "Shin", post: "Calf" }, side: 'left', group: 'leg', tbsa: 3, shape: { kind: 'polygon', pts: [[153.4, 697.1], [223.3, 703.2], [219.9, 751.7], [218.9, 785.1], [205.9, 820.3], [202, 867.2], [149.7, 864.5], [139.1, 782], [137.6, 747.2] ] } },
    { names: { ant: "Ankle", post: "Ankle" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[157.2, 842.4], [199, 843.4], [202.1, 866.6], [203, 882], [177.1, 880.3], [149, 883], [152.6, 863.1] ] } },
    { toes: [
      { label: "Great toe", cx: 184.1, w: 16, len: 25, yTop: 904.2, ang: 20 },
      { label: "2nd toe", cx: 168.6, w: 7.8, len: 20.9, yTop: 907.1, ang: 16 },
      { label: "3rd toe", cx: 161, w: 8, len: 19.5, yTop: 907, ang: 18 },
      { label: "4th toe", cx: 153.4, w: 5.6, len: 18.4, yTop: 905.7, ang: 14 },
      { label: "5th toe", cx: 148, w: 6.3, len: 16.4, yTop: 906.2, ang: 15 },
    ] },
    { names: { ant: "Foot dorsum", post: "Heel" }, side: 'left', group: 'foot', tbsa: 1, shape: box(134.7, 862.1, 199.8, 936.4) },
  ],
}
