// Realistic humanoid figure — PRESENTATION ONLY.
//
// Draws a 3D-scan-style quad mesh wrapping an anatomical body. It carries NO
// hit-testing: taps are resolved separately by the hidden lookup table in
// @triage-link/core (regionAt / zoneAt over BODY_VIEWBOX). Nothing is overlaid
// at runtime — a tap is just an (x, y) looked up in that table.
//
// The mesh is generated procedurally at module load: the left-half silhouette
// (image-left = patient's right) is authored once and mirrored, flattened to a
// fine polygon, then scanned line-by-line. Each scanline's inside x-intervals
// (which split correctly around the arms) become latitude segments; overlapping
// intervals between adjacent scanlines are joined by vertical longitude
// segments. The whole mesh is emitted as ONE path string so the figure is a
// few DOM nodes, not thousands. The silhouette is aligned to the core region
// boxes so the drawn body sits exactly where the lookup table expects it.
import { BODY_VIEWBOX, type BodyView } from '@triage-link/core'

type Pt = readonly [number, number]
const W = BODY_VIEWBOX.width
const H = BODY_VIEWBOX.height
const CX = W / 2
const P = (x: number, y: number): Pt => [x, y]
const mirror = ([x, y]: Pt): Pt => [2 * CX - x, y]

// Catmull-Rom sampled to a flattened point list.
function crSample(pts: ReadonlyArray<Pt>, closed: boolean, perSeg = 8): Pt[] {
  const n = pts.length
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  const out: Pt[] = []
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const [p0x, p0y] = at(i - 1)
    const [p1x, p1y] = at(i)
    const [p2x, p2y] = at(i + 1)
    const [p3x, p3y] = at(i + 2)
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t
      const x = 0.5 * (2 * p1x + (-p0x + p2x) * t + (2 * p0x - 5 * p1x + 4 * p2x - p3x) * t2 + (-p0x + 3 * p1x - 3 * p2x + p3x) * t3)
      const y = 0.5 * (2 * p1y + (-p0y + p2y) * t + (2 * p0y - 5 * p1y + 4 * p2y - p3y) * t2 + (-p0y + 3 * p1y - 3 * p2y + p3y) * t3)
      out.push([x, y])
    }
  }
  return out
}
function silhouette(left: ReadonlyArray<Pt>): Pt[] {
  const right = left.slice(1, -1).map(mirror).reverse()
  return [...left, ...right]
}

// Left-half outline (crown center → image-left → crotch center). Arms are
// aligned to the core region boxes so taps on the drawn limb resolve correctly.
const LEFT: Pt[] = [
  P(240, 18),
  P(216, 20), P(194, 34), P(182, 64), P(180, 98), P(186, 128), P(196, 158), P(214, 184),
  P(226, 198), P(222, 214), P(214, 228),
  P(190, 234), P(156, 244), P(120, 256),
  P(115, 290), P(113, 340), P(113, 398), P(114, 432),
  P(111, 476), P(110, 540), P(111, 598),
  P(102, 618), P(92, 648), P(96, 684),
  P(101, 720), P(108, 762), P(118, 784),
  P(150, 770), P(160, 716), P(162, 674),
  P(157, 642), P(152, 624),
  P(153, 582), P(157, 528), P(162, 474), P(166, 440),
  P(170, 380), P(174, 320), P(178, 286),
  P(190, 300), P(199, 330), P(199, 356), P(196, 386),
  P(190, 424), P(180, 458),
  P(175, 506), P(174, 566), P(178, 636), P(183, 706), P(186, 742),
  P(189, 780), P(193, 838), P(196, 898), P(198, 944), P(199, 968),
  P(190, 986), P(182, 1006), P(190, 1026), P(214, 1034), P(228, 1030),
  P(230, 1006), P(226, 984),
  P(224, 946), P(222, 898), P(222, 838), P(228, 792), P(232, 744),
  P(236, 700), P(239, 640), P(240, 560), P(240, 526),
]

const POLY = crSample(silhouette(LEFT), true, 8)

// Inside x-intervals where horizontal line y crosses the closed polygon.
function intervals(y: number): Array<[number, number]> {
  const xs: number[] = []
  for (let i = 0; i < POLY.length; i++) {
    const [x1, y1] = POLY[i]
    const [x2, y2] = POLY[(i + 1) % POLY.length]
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1))
    }
  }
  xs.sort((a, b) => a - b)
  const iv: Array<[number, number]> = []
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1) iv.push([xs[i], xs[i + 1]])
  return iv
}

function buildMesh(DY = 15, CELL = 15): string {
  const segs: string[] = []
  const seg = (x1: number, y1: number, x2: number, y2: number) =>
    segs.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`)
  let prev: Array<[number, number]> | null = null
  let prevY = 0
  for (let y = 22; y <= H - 6; y += DY) {
    const iv = intervals(y)
    for (const [a, b] of iv) {
      const n = Math.max(1, Math.round((b - a) / CELL))
      for (let i = 0; i < n; i++) seg(a + (b - a) * i / n, y, a + (b - a) * (i + 1) / n, y)
    }
    if (prev) {
      for (const [a, b] of iv) {
        let best: [number, number] | null = null
        let bestOv = 0
        for (const [c, d] of prev) {
          const ov = Math.min(b, d) - Math.max(a, c)
          if (ov > bestOv) { bestOv = ov; best = [c, d] }
        }
        if (best) {
          const [c, d] = best
          const q = Math.max(1, Math.round((b - a) / CELL))
          for (let i = 0; i <= q; i++) {
            const x = a + (b - a) * (i / q)
            const ux = Math.max(c, Math.min(d, x)) // vertical alignment -> no fanning at branches
            seg(ux, prevY, x, y)
          }
        }
      }
    }
    prev = iv
    prevY = y
  }
  return segs.join('')
}

const MESH_PATH = buildMesh()
const RIM_PATH = 'M' + POLY.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z'

/** Combined quad-mesh path (one path, all latitude + longitude segments). */
export function figureMeshPath(): string {
  return MESH_PATH
}

/** Closed silhouette outline ("rim") path. */
export function figureRimPath(): string {
  return RIM_PATH
}

// ---- Optional image figure layer --------------------------------------------
// Drop licensed figure images into  public/figure/anterior.*  and
// public/figure/posterior.*  and the app uses them automatically; until the
// files exist, the <image> fails to load and the procedural mesh renders as a
// fallback (see BodyChart). `align` is an SVG transform that fits the image to
// the hidden region-lookup coordinates (tuned once the real image is in).
export interface FigureImageConfig {
  href: string
  /** Natural pixel size of the source image. */
  w: number
  h: number
  /**
   * SVG transform that maps the natural-size image into BODY_VIEWBOX user
   * space. Derived by measuring each image's body bounding box and uniformly
   * scaling it to FIT THE FRAME: because this figure has a wide stance (arms
   * spread, legs apart) the body is wider than the tall viewBox, so it is
   * scaled to the frame WIDTH and centred vertically — keeping the whole body
   * (hands and feet included) visible and undistorted. (Tap regions are a
   * separate concern; they are re-aligned to the figure's pose in body-model.)
   */
  align: string
}

export const FIGURE_IMAGE: Record<BodyView, FigureImageConfig> = {
  anterior: {
    href: '/figure/anterior.png',
    w: 1086,
    h: 1448,
    align: 'translate(-137.96 21.17) scale(0.69670)',
  },
  posterior: {
    href: '/figure/posterior.png',
    w: 1086,
    h: 1448,
    align: 'translate(-136.91 33.71) scale(0.69670)',
  },
}
