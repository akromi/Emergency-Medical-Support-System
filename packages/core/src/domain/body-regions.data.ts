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
      { name: "Nose", group: 'face', tbsa: 0.3, shape: { kind: 'polygon', pts: [[237.4, 158.7], [238.7, 155.3], [240.9, 153.4], [242.5, 155.4], [244, 157.3], [248.2, 167], [252.1, 177.3], [229, 177.9], [232.7, 167.7]] } },
      { name: "Mouth", group: 'face', tbsa: 0.3, shape: box(224.6, 180.7, 255, 191.3) },
      { name: "Cheek", side: 'left', group: 'face', tbsa: 0.6, shape: box(210.6, 164.4, 226.4, 203.2) },
      { name: "Chin", group: 'face', tbsa: 0.4, shape: box(219, 192, 265.6, 207.9) },
      { name: "Forehead", group: 'face', tbsa: 1, shape: box(205.4, 140.3, 276.4, 151.2) },
      { name: "Crown", group: 'head', tbsa: 1, shape: { kind: 'polygon', pts: [[274.6, 138.9], [240.5, 140], [205.3, 140.5], [205.3, 140.5], [207.3, 132.9], [211.5, 123], [218.7, 113], [227.7, 108], [241.2, 106], [248.7, 108], [259, 112], [267.1, 118], [272.6, 128.8], [274.6, 138.9]] } },
    ],
    posterior: [
      { name: "Ear", side: 'left', group: 'face', tbsa: 0.4, shape: { kind: 'ellipse', cx: 205.2, cy: 174.7, rx: 5.8, ry: 11.9, rot: -19 } },
      { name: "Posterior scalp", group: 'head', tbsa: 1.5, shape: { kind: 'polygon', pts: [[216, 116], [246, 106], [268, 116], [272.4, 134.8], [274, 162], [206, 162], [206.7, 132]] } },
      { name: "Occiput", group: 'head', tbsa: 2, shape: box(207, 164.2, 272, 191.5) },
      { name: "Nape", group: 'neck', tbsa: 0.5, shape: box(214.4, 220.3, 266.4, 243.3) },
    ],
  },
  central: [
    { names: { ant: "Anterior neck", post: "Posterior neck" }, group: 'neck', tbsa: 0.5, shape: box(205, 190.8, 275, 258) },
    { names: { ant: "Upper abdomen", post: "Mid back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[165.2, 346.3], [319.5, 345.2], [306.6, 388.7], [305.7, 429.5], [172.8, 425.9], [171.7, 390.5]] } },
    { names: { ant: "Lower abdomen", post: "Lower back" }, group: 'trunk', tbsa: 3, shape: { kind: 'polygon', pts: [[174, 427], [307.8, 427], [308.5, 460.8], [290.3, 456], [267.2, 460.8], [240.9, 473.9], [212.9, 459.2], [189.6, 448.9], [176.6, 451.6]] } },
    // Top extended up to y472 to close the midline strip between Lower abdomen/back
    // and the genital region (the mirrored Pelvis halves don't meet on the midline).
    { names: { ant: "Groin", post: "Perineum" }, group: 'trunk', tbsa: 1, shape: { kind: 'polygon', pts: [[220, 472], [256, 472], [255.8, 512], [254.5, 538.3], [246, 558], [234, 558], [224.9, 533.1], [221.5, 510.4]] } },
  ],
  left: [
    { names: { ant: "Shoulder", post: "Shoulder" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[140.6, 257.1], [162.4, 246.3], [210.7, 226.5], [212.1, 254.1], [174.9, 255.4], [161.8, 276.5], [165.3, 294.4], [122.5, 300.3]] } },
    { names: { ant: "Chest", post: "Upper back" }, side: 'left', group: 'trunk', tbsa: 4.5, shape: box(166, 258, 241, 343.3) },
    { names: { ant: "Pelvis", post: "Buttock" }, side: 'left', group: 'trunk', tbsa: 2, shape: { kind: 'polygon', pts: [[188.5, 454], [203.8, 453.4], [216.4, 460.7], [230.9, 474.6], [241.7, 494.3], [239.7, 524.6], [229.6, 550.2], [197.1, 558.8], [173.3, 537.6], [165.7, 494.8], [173.3, 467.3]] } },
    { names: { ant: "Upper arm", post: "Upper arm" }, side: 'left', group: 'arm', tbsa: 2, shape: { kind: 'polygon', pts: [[125.6, 306.9], [171.1, 292.9], [171.3, 304.9], [169.4, 325.5], [161.9, 339.4], [152, 359.6], [112.2, 351.2], [113.6, 347.7], [117.9, 331.1], [124.9, 321.3], [124.3, 316.7]] } },
    { names: { ant: "Elbow", post: "Elbow" }, side: 'left', group: 'arm', tbsa: 0.5, shape: { kind: 'polygon', pts: [[111.9, 351.6], [149.5, 362.4], [144.7, 369.3], [140.1, 377.2], [135.7, 394.6], [90.1, 385.7], [101.5, 373]] } },
    { names: { ant: "Forearm", post: "Forearm" }, side: 'left', group: 'arm', tbsa: 1.5, shape: { kind: 'polygon', pts: [[89.2, 385.8], [139.1, 395.5], [88.7, 475.4], [58.7, 466.1]] } },
    { names: { ant: "Wrist", post: "Wrist" }, side: 'left', group: 'arm', tbsa: 0.3, shape: { kind: 'polygon', pts: [[59.7, 466.3], [86.6, 475.5], [80.6, 492.4], [65.2, 490.3], [51.8, 478.3]] } },
    { names: { ant: "Thumb proximal", post: "Thumb proximal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[31.9, 486.5], [51.1, 476.2], [55.9, 482.3], [59.8, 487.1], [37.7, 497]] } },
    { names: { ant: "Thumb distal", post: "Thumb distal" }, side: 'left', group: 'hand', tbsa: 0.1, shape: { kind: 'polygon', pts: [[10, 504.3], [16.5, 502.6], [20.5, 497.7], [32, 487.4], [38.3, 497.5], [28.2, 504.3], [22, 509.1], [13.3, 510.7], [8.6, 507.6]] } },
    { fingers: [
      { label: "Index", rootX: 34.1, rootY: 517.1, ang: -33.1, w: 9, lens: [15.4, 12.4, 10.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Middle", rootX: 42, rootY: 523.4, ang: -24, w: 9, lens: [16.8, 13.1, 11.1], tbsa: [0.06, 0.05, 0.05] },
      { label: "Ring", rootX: 51.5, rootY: 526, ang: -16.1, w: 9, lens: [15.2, 12, 10], tbsa: [0.06, 0.05, 0.05] },
      { label: "Little", rootX: 62.8, rootY: 525.3, ang: -10.3, w: 7.9, lens: [12.1, 9.7, 7.7], tbsa: [0.06, 0.05, 0.05] },
    ] },
    { names: { ant: "Palm", post: "Back of hand" }, side: 'left', group: 'hand', tbsa: 0.5, shape: { kind: 'polygon', pts: [[37.2, 498.6], [59.4, 486.4], [69.2, 491.3], [76.4, 492.8], [80.9, 492], [78.6, 505.7], [72.7, 516.3], [67.6, 525.2], [62.1, 526.1], [48.2, 524.9], [29.1, 516.6], [30.8, 507.1]] } },
    { names: { ant: "Knee", post: "Back of knee" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[167, 662.7], [218.5, 661.2], [214.4, 687], [204.7, 711.9], [161.2, 710.5]] } },
    { names: { ant: "Thigh", post: "Thigh" }, side: 'left', group: 'leg', tbsa: 4.5, shape: { kind: 'polygon', pts: [[160.7, 513.6], [194.5, 563.9], [224.2, 556.5], [236.6, 546.6], [217, 668.5], [192.3, 663.6], [162, 664.5], [150, 602.6], [152.5, 553]] } },
    { names: { ant: "Shin", post: "Calf" }, side: 'left', group: 'leg', tbsa: 3, shape: { kind: 'polygon', pts: [[162, 709.9], [210.5, 714.2], [207.9, 751.1], [206.9, 782.7], [194.1, 817.7], [191, 854.6], [160.3, 853.1], [151.1, 781], [149.6, 748.8]] } },
    { names: { ant: "Ankle", post: "Ankle" }, side: 'left', group: 'leg', tbsa: 0.5, shape: { kind: 'polygon', pts: [[164.2, 854.9], [192, 855.4], [193.6, 866.8], [193.6, 879.9], [159.8, 879.4], [161.2, 867.4]] } },
    { toes: [
      { label: "Great toe", cx: 175.1, w: 10, len: 16, yTop: 911.2 },
      { label: "2nd toe", cx: 163.6, w: 8.8, len: 16.9, yTop: 910.1 },
      { label: "3rd toe", cx: 157, w: 6, len: 17.5, yTop: 908 },
      { label: "4th toe", cx: 150.4, w: 5.6, len: 13.4, yTop: 908.7 },
      { label: "5th toe", cx: 145.5, w: 3.3, len: 12.4, yTop: 909.1 },
    ] },
    { names: { ant: "Foot dorsum", post: "Heel" }, side: 'left', group: 'foot', tbsa: 1, shape: box(143, 878, 192, 930) },
  ],
}
