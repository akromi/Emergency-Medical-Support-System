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
      { name: "Occiput", group: 'head', tbsa: 2, shape: box(201, 158.2, 278, 197.5) },
      { name: "Nape", group: 'neck', tbsa: 0.5, shape: box(208.4, 214.3, 272.4, 249.3) },
    ],
  },
  central: [
    { names: { ant: "Anterior neck", post: "Posterior neck" }, group: 'neck', tbsa: 0.5, shape: box(205.1, 184.8, 274.9, 266) },
    { names: { ant: "Upper abdomen", post: "Mid back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[158.3, 340.3], [327.6, 339.1], [312.6, 389.6], [311.6, 435.7], [167, 431.7], [165.7, 391] ] } },
    { names: { ant: "Lower abdomen", post: "Lower back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[167.1, 427], [313.7, 427], [314.7, 468.6], [290.1, 462.2], [269.2, 466.5], [240.8, 480.6], [210.3, 464.6], [188.9, 455.2], [171.5, 458.8] ] } },
    { names: { ant: "Groin", post: "Perineum" }, group: 'trunk', tbsa: 1, shape: { kind: 'polygon', pts: [[221.5, 510.4], [255.8, 512], [254.5, 538.3], [243.1, 545.7], [235.4, 545.9], [224.9, 533.1] ] } },
  ],
  left: [
    { names: { ant: "Shoulder", post: "Shoulder" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[135.9, 252.7], [159.9, 240.8], [216.3, 217.7], [218.4, 259.9], [178.3, 261.3], [168.1, 277.7], [172.4, 299.5], [112.9, 307.7] ] } },
    { names: { ant: "Chest", post: "Upper back" }, side: 'left', group: 'trunk', tbsa: 4.5, shape: box(160, 252, 244, 349.3) },
    { names: { ant: "Pelvis", post: "Buttock" }, side: 'left', group: 'trunk', tbsa: 2, shape: { kind: 'polygon', pts: [[186.1, 448.1], [205.3, 447.3], [220, 455.9], [235.7, 470.9], [247.8, 492.9], [245.6, 525.9], [234.1, 555.2], [195.5, 565.4], [167.8, 540.7], [159.6, 494.5], [168, 464] ] } },
    { names: { ant: "Upper arm", post: "Upper arm" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[120.2, 302.3], [177, 284.8], [177.3, 305.1], [175.3, 327.3], [167.2, 342.1], [155.3, 366.4], [104, 355.6], [107.9, 345.8], [112.4, 328.5], [118.6, 319.7], [118.2, 316.7] ] } },
    { names: { ant: "Elbow", post: "Elbow" }, side: 'left', group: 'arm', tbsa: 0.5, shape: { kind: 'polygon', pts: [[108.7, 344.4], [159.2, 358.9], [149.8, 372.5], [145.7, 379.5], [140.1, 401.6], [78.6, 389.6], [96.5, 369.6] ] } },
    { names: { ant: "Forearm", post: "Forearm" }, side: 'left', group: 'arm', tbsa: 1.5, shape: { kind: 'polygon', pts: [[85.4, 378.9], [148.9, 391.3], [91.3, 482.5], [50.8, 469.9] ] } },
    { names: { ant: "Wrist", post: "Wrist" }, side: 'left', group: 'arm', tbsa: 0.3, shape: { kind: 'polygon', pts: [[57.2, 459.1], [94.3, 471.8], [84.6, 499], [62.6, 496], [43.9, 479.3] ] } },
    { names: { ant: "Thumb proximal", post: "Thumb proximal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[23.7, 484.1], [52.7, 468.5], [60.6, 478.6], [69.4, 489.4], [35.1, 504.7] ] } },
    { names: { ant: "Thumb distal", post: "Thumb distal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[5.6, 499.2], [13.1, 497.3], [16.1, 493.5], [33.3, 478.2], [46.5, 499.2], [31.7, 509.2], [24.5, 514.7], [12, 517], [1.1, 509.9] ] } },
    { fingers: [
      { label: "Index", rootX: 34.1, rootY: 517.1, ang: -33.1, w: 9, lens: [15.4, 12.4, 10.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Middle", rootX: 42, rootY: 523.4, ang: -24, w: 9, lens: [16.8, 13.1, 11.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Ring", rootX: 51.5, rootY: 526, ang: -16.1, w: 9, lens: [15.2, 12, 10], tbsa: [0.06, 0.05, 0.05] },
      { label: "Little", rootX: 62.8, rootY: 525.3, ang: -10.3, w: 7.9, lens: [12.1, 9.7, 7.7], tbsa: [0.06, 0.05, 0.05] },
    ] },
    { names: { ant: "Palm", post: "Back of hand" }, side: 'left', group: 'hand', tbsa: 0.5, shape: { kind: 'polygon', pts: [[33.2, 494], [59.3, 479.6], [71.2, 485.6], [76.5, 486.7], [88.2, 484.6], [84.3, 507.7], [77.9, 519.3], [71.4, 530.7], [62.3, 532.1], [46.7, 530.8], [22.4, 520.2], [25.1, 504.6] ] } },
    { names: { ant: "Knee", post: "Back of knee" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[161.7, 656.9], [225.6, 655], [220.2, 688.6], [208.7, 718], [154.5, 716.3] ] } },
    { names: { ant: "Thigh", post: "Thigh" }, side: 'left', group: 'leg', tbsa: 4.5, shape: { kind: 'polygon', pts: [[157.7, 498.4], [197.1, 557.1], [221.5, 551], [245, 532.2], [221.9, 675.6], [191.8, 669.6], [157.1, 670.6], [144, 603], [146.5, 552.2] ] } },
    { names: { ant: "Shin", post: "Calf" }, side: 'left', group: 'leg', tbsa: 3, shape: { kind: 'polygon', pts: [[157.7, 703.5], [216.9, 708.7], [213.9, 751.4], [212.9, 783.9], [200, 819], [196.5, 860.9], [155, 858.8], [145.1, 781.5], [143.6, 748] ] } },
    { names: { ant: "Ankle", post: "Ankle" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[159.5, 848.8], [197.2, 849.5], [199.6, 866.4], [199.6, 886], [153.1, 885.3], [155.3, 866.3] ] } },
    { toes: [
      { label: "Great toe", cx: 175.1, w: 10, len: 16, yTop: 911.2 },
      { label: "2nd toe", cx: 163.6, w: 8.8, len: 16.9, yTop: 910.1 },
      { label: "3rd toe", cx: 157, w: 6, len: 17.5, yTop: 908 },
      { label: "4th toe", cx: 150.4, w: 5.6, len: 13.4, yTop: 908.7 },
      { label: "5th toe", cx: 145.5, w: 3.3, len: 12.4, yTop: 909.1 },
    ] },
    { names: { ant: "Foot dorsum", post: "Heel" }, side: 'left', group: 'foot', tbsa: 1, shape: box(137.9, 862.2, 196.9, 933.2) },
  ],
}
