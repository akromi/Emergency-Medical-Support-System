// Exhaustive anatomical body model in SVG user space. This is the single source
// of truth for BOTH the rendered body chart and regionAt() hit-testing, so the
// drawn figure and the tappable regions can never drift apart.
//
// The figure is a larger, detailed silhouette (head with facial features, arms
// with individual finger phalanges, legs with individual toes) generated from
// primitives so the ~150 regions stay consistent. Image-left parts are authored
// once and mirrored to image-right.
import type { BodyView, AgeBand } from './types.js'

export const BODY_VIEWBOX = { width: 480, height: 1040 } as const

export type RegionGroup =
  | 'head' | 'face' | 'neck' | 'trunk' | 'arm' | 'hand' | 'leg' | 'foot'

export type Point = readonly [number, number]

export interface BodyRegion {
  /** Display name (no side prefix; regionAt() adds the anatomical side). */
  name: string
  /** Image side for paired parts (anterior: image-left = patient's right). */
  side?: 'left' | 'right'
  group: RegionGroup
  /** Surface-area % for this region's marked aspect (rule-of-nines scale). */
  tbsa: number
  points: ReadonlyArray<Point>
}

const W = BODY_VIEWBOX.width
const r1 = (n: number) => Math.round(n * 10) / 10

const box = (x1: number, y1: number, x2: number, y2: number): Point[] =>
  [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 16): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [r1(cx + rx * Math.cos(a)), r1(cy + ry * Math.sin(a))] as Point
  })

/**
 * Slanted quad: a limb segment whose centre line runs from (cxTop, yTop) to
 * (cxBot, yBot), with independent top/bottom widths. Lets the arm boxes follow
 * the figure's abducted (spread) arms, which a vertical trapezoid cannot.
 */
const quad = (cxTop: number, yTop: number, wTop: number, cxBot: number, yBot: number, wBot: number): Point[] =>
  [[r1(cxTop - wTop / 2), yTop], [r1(cxTop + wTop / 2), yTop], [r1(cxBot + wBot / 2), yBot], [r1(cxBot - wBot / 2), yBot]]

/**
 * Stack segment boxes along a fanned axis (angle in degrees from straight-down,
 * positive = toward +x). Used for the splayed fingers of the open hand.
 */
function digitFan(
  rootX: number, rootY: number, angDeg: number, group: RegionGroup, side: 'left',
  label: string, w: number, segs: Array<{ seg: string; len: number; tbsa: number }>,
): RawSide[] {
  const a = (angDeg * Math.PI) / 180
  const dx = Math.sin(a), dy = Math.cos(a)
  const px = dy, py = -dx // perpendicular (unit)
  let x = rootX, y = rootY
  return segs.map((s) => {
    const nx = x + dx * s.len, ny = y + dy * s.len
    const region: RawSide = {
      name: `${label} ${s.seg}`, side, group, tbsa: s.tbsa,
      points: [
        [r1(x + px * w / 2), r1(y + py * w / 2)], [r1(x - px * w / 2), r1(y - py * w / 2)],
        [r1(nx - px * w / 2), r1(ny - py * w / 2)], [r1(nx + px * w / 2), r1(ny + py * w / 2)],
      ],
    }
    x = nx; y = ny
    return region
  })
}

interface RawSide extends BodyRegion { side: 'left' }
type AntPost = { ant: string; post: string }

// A shared (limb/trunk) part carries a name for each view.
interface SharedPart {
  names: AntPost
  side?: 'left' | 'right'
  group: RegionGroup
  tbsa: number
  points: ReadonlyArray<Point>
}

const mirrorX = (pts: ReadonlyArray<Point>): Point[] => pts.map(([x, y]) => [r1(W - x), y] as Point)

// ---- Head / face (view-specific) ------------------------------------------

function headRegions(view: BodyView): BodyRegion[] {
  const out: BodyRegion[] = []
  if (view === 'anterior') {
    // Fitted to public/figure/anterior.png (see scripts/fit notes). Fine
    // features are listed BEFORE the larger Cheek/Forehead/Crown boxes so a tap
    // in any overlap resolves to the finer feature (Eye/Ear beat Cheek, etc.).
    // Paired features carry side:'left' (image-left) and are mirrored below.
    out.push(
      { name: 'Eye', side: 'left', group: 'face', tbsa: 0.3, points: ellipse(226, 160, 13, 8) },
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, points: ellipse(201, 170, 9, 18) },
      { name: 'Nose', group: 'face', tbsa: 0.3, points: box(232, 156, 248, 183) },
      { name: 'Mouth', group: 'face', tbsa: 0.3, points: box(224, 185, 256, 199) },
      { name: 'Cheek', side: 'left', group: 'face', tbsa: 0.6, points: box(202, 166, 229, 200) },
      { name: 'Chin', group: 'face', tbsa: 0.4, points: box(218, 199, 262, 222) },
      { name: 'Forehead', group: 'face', tbsa: 1, points: box(200, 140, 280, 154) },
      { name: 'Crown', group: 'head', tbsa: 1, points: box(202, 108, 278, 140) },
    )
  } else {
    // Fitted to public/figure/posterior.png. Ear first (and raised to true ear
    // level) so the head-edge overlap resolves to Ear, not the scalp/occiput.
    out.push(
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, points: ellipse(200, 170, 8, 17) },
      { name: 'Posterior scalp', group: 'head', tbsa: 1.5, points: box(206, 113, 274, 162) },
      { name: 'Occiput', group: 'head', tbsa: 2, points: box(204, 162, 276, 210) },
      { name: 'Nape', group: 'neck', tbsa: 0.5, points: box(220, 210, 260, 233) },
    )
  }
  // Mirror the image-left head parts to image-right.
  for (const r of out.filter((x) => x.side === 'left')) {
    out.push({ ...r, side: 'right', points: mirrorX(r.points) })
  }
  return out
}

// ---- Shared body / limbs (named per view) ---------------------------------

function sharedParts(): SharedPart[] {
  const parts: SharedPart[] = []

  // Central trunk (coordinates trace the figure image; see chart alignment).
  parts.push(
    { names: { ant: 'Anterior neck', post: 'Posterior neck' }, group: 'neck', tbsa: 0.5, points: box(220, 224, 260, 256) },
    { names: { ant: 'Upper abdomen', post: 'Mid back' }, group: 'trunk', tbsa: 3, points: box(184, 392, 296, 452) },
    { names: { ant: 'Lower abdomen', post: 'Lower back' }, group: 'trunk', tbsa: 3, points: box(192, 452, 288, 506) },
  )

  // Image-left (mirrored later). Authored as side:'left'.
  const left: SharedPart[] = []
  const L = (names: AntPost, group: RegionGroup, tbsa: number, points: ReadonlyArray<Point>): void => {
    left.push({ names, side: 'left', group, tbsa, points })
  }

  L({ ant: 'Shoulder', post: 'Shoulder' }, 'arm', 2, box(150, 250, 202, 300))
  L({ ant: 'Chest', post: 'Upper back' }, 'trunk', 4.5, box(176, 258, 240, 392))
  L({ ant: 'Pelvis', post: 'Buttock' }, 'trunk', 2, box(196, 506, 240, 560))

  // Arm — abducted (spread), so segments slant out to the hand (see quad()).
  L({ ant: 'Upper arm', post: 'Upper arm' }, 'arm', 2, quad(146, 300, 50, 90, 432, 40))
  L({ ant: 'Elbow', post: 'Elbow' }, 'arm', 0.5, quad(90, 432, 40, 80, 458, 38))
  L({ ant: 'Forearm', post: 'Forearm' }, 'arm', 1.5, quad(80, 458, 36, 52, 498, 32))
  L({ ant: 'Wrist', post: 'Wrist' }, 'arm', 0.3, quad(52, 498, 30, 48, 510, 28))

  // Open hand, fitted to public/figure/anterior.png. In anatomical position the
  // image-left hand is the patient's RIGHT, palm forward: the thumb is LATERAL
  // (low x) and the fingers fan down from the knuckle row (~y523), index→little
  // running left→right. Digits are listed BEFORE the palm so a tap on a digit
  // resolves to it rather than to the palm box it overlaps at the base.
  L({ ant: 'Thumb proximal', post: 'Thumb proximal' }, 'hand', 0.1, box(33, 503, 53, 525))
  L({ ant: 'Thumb distal', post: 'Thumb distal' }, 'hand', 0.1, box(14, 521, 37, 546))
  const fingers: Array<{ label: string; rootX: number; rootY: number; ang: number; w: number; lens: [number, number, number] }> = [
    { label: 'Index', rootX: 38, rootY: 524, ang: -17, w: 9, lens: [11, 9, 7] },
    { label: 'Middle', rootX: 47, rootY: 525, ang: -7, w: 9, lens: [14, 11, 9] },
    { label: 'Ring', rootX: 56, rootY: 524, ang: -2, w: 9, lens: [11, 9, 7] },
    { label: 'Little', rootX: 63, rootY: 521, ang: 3, w: 8, lens: [8, 6, 5] },
  ]
  for (const f of fingers) {
    for (const d of digitFan(f.rootX, f.rootY, f.ang, 'hand', 'left', f.label, f.w, [
      { seg: 'proximal', len: f.lens[0], tbsa: 0.06 },
      { seg: 'middle', len: f.lens[1], tbsa: 0.05 },
      { seg: 'distal', len: f.lens[2], tbsa: 0.05 },
    ])) left.push({ names: { ant: d.name, post: d.name }, side: 'left', group: 'hand', tbsa: d.tbsa, points: d.points })
  }
  L({ ant: 'Palm', post: 'Back of hand' }, 'hand', 0.5, box(34, 494, 80, 524))

  // Leg — fitted to the figure: the legs CONVERGE toward the midline going
  // down, so the knee/shin/ankle sit more medially than the thigh's top. Knee
  // box centred on the patella (~x197 on the image-left leg).
  L({ ant: 'Thigh', post: 'Thigh' }, 'leg', 4.5, quad(205, 512, 76, 196, 720, 52))
  L({ ant: 'Knee', post: 'Back of knee' }, 'leg', 0.5, box(174, 724, 220, 766))
  L({ ant: 'Shin', post: 'Calf' }, 'leg', 3, quad(196, 766, 48, 189, 856, 34))
  L({ ant: 'Ankle', post: 'Ankle' }, 'leg', 0.5, box(171, 856, 207, 884))
  L({ ant: 'Foot dorsum', post: 'Sole' }, 'foot', 1, box(150, 884, 204, 908))

  // Toes (great toe is medial → larger x on image-left foot). Traced to the
  // figure's toe row (~x145-188) at the bottom of the foot.
  const toes: Array<{ label: string; cx: number; w: number; len: number }> = [
    { label: 'Great toe', cx: 194, w: 13, len: 16 },
    { label: '2nd toe', cx: 182, w: 10, len: 15 },
    { label: '3rd toe', cx: 172, w: 9, len: 14 },
    { label: '4th toe', cx: 163, w: 9, len: 13 },
    { label: '5th toe', cx: 155, w: 8, len: 11 },
  ]
  for (const t of toes) {
    left.push({ names: { ant: t.label, post: t.label }, side: 'left', group: 'foot', tbsa: 0.1, points: box(r1(t.cx - t.w / 2), 908, r1(t.cx + t.w / 2), 908 + t.len) })
  }

  parts.push(...left)
  // Mirror image-left → image-right.
  for (const p of left) {
    parts.push({ ...p, side: 'right', points: mirrorX(p.points) })
  }
  return parts
}

// Build once; reuse for every call.
const SHARED = sharedParts()

function buildView(view: BodyView): BodyRegion[] {
  const shared: BodyRegion[] = SHARED.map((p) => ({
    name: view === 'anterior' ? p.names.ant : p.names.post,
    side: p.side,
    group: p.group,
    tbsa: p.tbsa,
    points: p.points,
  }))
  // Most-specific first: head/face and distal limb parts before big trunk/limb
  // segments, so overlapping joints resolve to the finer part.
  const head = headRegions(view)
  return [...head, ...shared]
}

const ANTERIOR = buildView('anterior')
const POSTERIOR = buildView('posterior')

/** All anatomical regions for a view (UI render + hit-test share this). */
export function bodyRegions(view: BodyView): ReadonlyArray<BodyRegion> {
  return view === 'anterior' ? ANTERIOR : POSTERIOR
}

// ---- Macro zones (for tap-to-zoom "blow up") ------------------------------

export interface BodyZone {
  key: string
  name: string
  side?: 'left' | 'right'
  group: RegionGroup
  /** Padded bounding box in SVG user space. */
  bbox: { x: number; y: number; w: number; h: number }
}

const ZONE_PAD = 14
const ZONE_NAME: Partial<Record<RegionGroup, string>> = {
  head: 'Head', neck: 'Neck', trunk: 'Torso', arm: 'Arm', hand: 'Hand', leg: 'Leg', foot: 'Foot',
}

function macroKey(r: BodyRegion): { key: string; name: string; side?: 'left' | 'right'; group: RegionGroup } {
  if (r.group === 'head' || r.group === 'face') return { key: 'head', name: 'Head', group: 'head' }
  if (r.group === 'neck') return { key: 'neck', name: 'Neck', group: 'neck' }
  if (r.group === 'trunk') return { key: 'torso', name: 'Torso', group: 'trunk' }
  return { key: `${r.group}-${r.side}`, name: ZONE_NAME[r.group] ?? r.group, side: r.side, group: r.group }
}

function buildZones(view: BodyView): BodyZone[] {
  const acc = new Map<string, { meta: ReturnType<typeof macroKey>; x1: number; y1: number; x2: number; y2: number }>()
  for (const r of bodyRegions(view)) {
    const meta = macroKey(r)
    let z = acc.get(meta.key)
    if (!z) { z = { meta, x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }; acc.set(meta.key, z) }
    for (const [x, y] of r.points) { z.x1 = Math.min(z.x1, x); z.y1 = Math.min(z.y1, y); z.x2 = Math.max(z.x2, x); z.y2 = Math.max(z.y2, y) }
  }
  return [...acc.values()].map((z) => ({
    key: z.meta.key, name: z.meta.name, side: z.meta.side, group: z.meta.group,
    bbox: {
      x: Math.max(0, z.x1 - ZONE_PAD),
      y: Math.max(0, z.y1 - ZONE_PAD),
      w: Math.min(BODY_VIEWBOX.width, z.x2 + ZONE_PAD) - Math.max(0, z.x1 - ZONE_PAD),
      h: Math.min(BODY_VIEWBOX.height, z.y2 + ZONE_PAD) - Math.max(0, z.y1 - ZONE_PAD),
    },
  }))
}

const ZONES_ANT = buildZones('anterior')
const ZONES_POST = buildZones('posterior')

/** Macro zones (head, neck, torso, each arm/hand/leg/foot) for a view. */
export function bodyZones(view: BodyView): ReadonlyArray<BodyZone> {
  return view === 'anterior' ? ZONES_ANT : ZONES_POST
}

/** Ray-casting point-in-polygon test. */
function inPoly(x: number, y: number, poly: ReadonlyArray<Point>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Macro zone for a tap. Resolves the precise region polygon under the point
 * first (so a chest tap maps to the torso zone even though the arm's padded
 * bbox overlaps it and is smaller), and maps it to its macro zone. Only when
 * the tap lands outside every region does it fall back to the smallest padded
 * bounding box — so taps just off the silhouette still zoom somewhere sensible.
 */
export function zoneAt(x: number, y: number, view: BodyView): BodyZone | null {
  const zones = bodyZones(view)
  for (const r of bodyRegions(view)) {
    if (inPoly(x, y, r.points)) {
      const z = zones.find((z) => z.key === macroKey(r).key)
      if (z) return z
    }
  }
  // Fallback: smallest padded bbox containing the point.
  let best: BodyZone | null = null
  let bestArea = Infinity
  for (const z of zones) {
    const b = z.bbox
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const area = b.w * b.h
      if (area < bestArea) { bestArea = area; best = z }
    }
  }
  return best
}

// ---- Burn TBSA ------------------------------------------------------------

export const REGION_TBSA: Readonly<Record<string, number>> = (() => {
  const m: Record<string, number> = {}
  for (const r of [...ANTERIOR, ...POSTERIOR]) m[r.name] = r.tbsa
  // Coarse names returned only by the off-silhouette band fallback. Don't
  // override real region names that happen to share a label (Chest, Pelvis).
  const fallback: Record<string, number> = {
    Head: 7, Chest: 9, Abdomen: 6, Pelvis: 3, 'Left lower limb': 9, 'Right lower limb': 9,
  }
  for (const [k, v] of Object.entries(fallback)) if (!(k in m)) m[k] = v
  return m
})()

// ---- Lund–Browder age adjustment ------------------------------------------
// Children aren't small adults: the head is proportionally much larger and the
// legs smaller, shifting with age. Lund–Browder gives per-surface % for the
// three age-varying body parts; the rest of the body is constant. We scale a
// region's adult % by (ageValue / adultValue) for its part — so adult inputs
// are unchanged (ratio 1) and a region keeps its share of the part.
const LUND_BROWDER: Record<'head' | 'thigh' | 'lowerLeg', Record<AgeBand, number>> = {
  head: { infant: 9.5, age1: 8.5, age5: 6.5, age10: 5.5, age15: 4.5, adult: 3.5 },
  thigh: { infant: 2.75, age1: 3.25, age5: 4.0, age10: 4.25, age15: 4.5, adult: 4.75 },
  lowerLeg: { infant: 2.5, age1: 2.5, age5: 2.75, age10: 3.0, age15: 3.25, adult: 3.5 },
}

// Base region name -> the age-varying Lund–Browder part it belongs to.
const REGION_AGE_PART: Readonly<Record<string, 'head' | 'thigh' | 'lowerLeg'>> = (() => {
  const m: Record<string, 'head' | 'thigh' | 'lowerLeg'> = {}
  for (const r of [...ANTERIOR, ...POSTERIOR]) {
    if (r.group === 'head' || r.group === 'face') m[r.name] = 'head'
    else if (r.name === 'Thigh') m[r.name] = 'thigh'
    else if (r.name === 'Shin' || r.name === 'Calf') m[r.name] = 'lowerLeg'
  }
  m['Head'] = 'head' // coarse off-silhouette fallback label
  return m
})()

function ageFactor(base: string, ageBand: AgeBand): number {
  const part = REGION_AGE_PART[base]
  if (!part || ageBand === 'adult') return 1
  return LUND_BROWDER[part][ageBand] / LUND_BROWDER[part].adult
}

/** TBSA % for a single region's marked aspect (side prefix ignored, age-adjusted). */
export function regionTBSA(region: string, ageBand: AgeBand = 'adult'): number {
  const base = region.replace(/^[LR]\s+/, '')
  const v = (REGION_TBSA[base] ?? 0) * ageFactor(base, ageBand)
  return Math.round(v * 100) / 100
}

/**
 * Estimate total burn surface area from marked injuries. Only `burn` injuries
 * count; each distinct region+view is counted once, so anterior and posterior
 * of one region add up while left/right count separately. Percentages are
 * Lund–Browder age-adjusted (head larger / legs smaller for children). Capped
 * at 100%.
 */
export function estimateBurnTBSA(
  injuries: ReadonlyArray<{ type: string; region: string; view: BodyView }>,
  ageBand: AgeBand = 'adult',
): number {
  const counted = new Set<string>()
  let total = 0
  for (const inj of injuries) {
    if (inj.type !== 'burn') continue
    const key = `${inj.view}|${inj.region}`
    if (counted.has(key)) continue
    counted.add(key)
    total += regionTBSA(inj.region, ageBand)
  }
  return Math.min(100, Math.round(total * 10) / 10)
}
