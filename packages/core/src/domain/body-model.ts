// Exhaustive anatomical body model in SVG user space. This is the single source
// of truth for BOTH the rendered body chart and regionAt() hit-testing, so the
// drawn figure and the tappable regions can never drift apart.
//
// The figure is a larger, detailed silhouette (head with facial features, arms
// with individual finger phalanges, legs with individual toes) generated from
// primitives so the ~150 regions stay consistent. Image-left parts are authored
// once and mirrored to image-right.
import type { BodyView, AgeBand } from './types.js'
import { BODY_REGION_DATA, type ShapeSpec, type BodyRegionData } from './body-regions.data.js'

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
  /** Overlap precedence; higher wins. Default/absent = 0 (authored order). */
  priority?: number
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
  priority?: number
  /** Only present on the anterior view (e.g. toes: their tops aren't visible on
   *  a standing back-view figure). Dropped from the posterior build. */
  antOnly?: boolean
  /** Only present on the posterior view (e.g. the sole/plantar surface, not seen
   *  on the dorsal/front figure). Dropped from the anterior build. */
  postOnly?: boolean
}

const mirrorX = (pts: ReadonlyArray<Point>): Point[] => pts.map(([x, y]) => [r1(W - x), y] as Point)

/** Rotate points by `deg` (clockwise) about (cx, cy). No-op when deg falsy. */
function rotatePoints(pts: Point[], cx: number, cy: number, deg = 0): Point[] {
  if (!deg) return pts
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    return [r1(cx + dx * c - dy * s), r1(cy + dx * s + dy * c)] as Point
  })
}

/** Turn a serialisable shape spec (from body-regions.data.ts) into polygon points. */
function shapePoints(s: ShapeSpec): Point[] {
  switch (s.kind) {
    case 'box': return rotatePoints(box(s.x1, s.y1, s.x2, s.y2), (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, s.rot)
    case 'ellipse': return rotatePoints(ellipse(s.cx, s.cy, s.rx, s.ry), s.cx, s.cy, s.rot)
    case 'quad': return quad(s.cxTop, s.yTop, s.wTop, s.cxBot, s.yBot, s.wBot)
    case 'polygon': return s.pts.map(([x, y]) => [r1(x), r1(y)] as Point)
  }
}

// ---- Head / face (view-specific) ------------------------------------------
// Geometry comes from BODY_REGION_DATA.head; this only expands shapes and
// mirrors the image-left paired features (Eye/Ear/Cheek) to the right.

function headRegions(view: BodyView, data: BodyRegionData): BodyRegion[] {
  const out: BodyRegion[] = data.head[view].map((s) => ({
    name: s.name as string, side: s.side, group: s.group, tbsa: s.tbsa, points: shapePoints(s.shape), priority: s.priority,
  }))
  for (const r of out.filter((x) => x.side === 'left')) {
    out.push({ ...r, side: 'right', points: mirrorX(r.points) })
  }
  return out
}

// ---- Shared body / limbs (named per view) ---------------------------------

// Geometry comes from BODY_REGION_DATA.central + .left. The image-left list is
// walked in order (finger/toe groups expand inline, so the hand digits keep
// their place between Wrist and Palm), then mirrored image-left → image-right.
function sharedParts(data: BodyRegionData): SharedPart[] {
  const parts: SharedPart[] = data.central.map((s) => ({
    names: s.names as AntPost, group: s.group, tbsa: s.tbsa, points: shapePoints(s.shape), priority: s.priority,
  }))

  const left: SharedPart[] = []
  for (const e of data.left) {
    if ('fingers' in e) {
      for (const f of e.fingers) {
        for (const d of digitFan(f.rootX, f.rootY, f.ang, 'hand', 'left', f.label, f.w, [
          { seg: 'proximal', len: f.lens[0], tbsa: f.tbsa[0] },
          { seg: 'middle', len: f.lens[1], tbsa: f.tbsa[1] },
          { seg: 'distal', len: f.lens[2], tbsa: f.tbsa[2] },
        ])) left.push({ names: { ant: d.name, post: d.name }, side: 'left', group: 'hand', tbsa: d.tbsa, points: d.points })
      }
    } else if ('toes' in e) {
      for (const t of e.toes) {
        const pts = rotatePoints(box(r1(t.cx - t.w / 2), t.yTop, r1(t.cx + t.w / 2), t.yTop + t.len), t.cx, t.yTop, t.ang)
        left.push({ names: { ant: t.label, post: t.label }, side: 'left', group: 'foot', tbsa: 0.1, antOnly: true, points: pts })
      }
    } else {
      left.push({ names: e.names as AntPost, side: 'left', group: e.group, tbsa: e.tbsa, points: shapePoints(e.shape), priority: e.priority, antOnly: e.antOnly, postOnly: e.postOnly })
    }
  }

  parts.push(...left)
  // Mirror image-left → image-right.
  for (const p of left) {
    parts.push({ ...p, side: 'right', points: mirrorX(p.points) })
  }
  return parts
}

function buildView(view: BodyView, data: BodyRegionData, shared: SharedPart[]): BodyRegion[] {
  const sharedRegions: BodyRegion[] = shared
    .filter((p) => view === 'anterior' ? !p.postOnly : !p.antOnly) // toes: anterior-only; sole: posterior-only
    .map((p) => ({
    name: view === 'anterior' ? p.names.ant : p.names.post,
    side: p.side,
    group: p.group,
    tbsa: p.tbsa,
    points: p.points,
    priority: p.priority,
  }))
  // Most-specific first: head/face and distal limb parts before big trunk/limb
  // segments, so overlapping joints resolve to the finer part. Then a STABLE sort
  // by priority (higher first) lets the calibrator lift a region above others —
  // across groups too — while leaving the authored order intact for equal (0)
  // priority, so default data hit-tests exactly as before.
  const head = headRegions(view, data)
  const all = [...head, ...sharedRegions]
  return all.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

// Active region data + a rebuildable cache. applyRegionData() swaps the source
// (e.g. a saved calibration) and invalidates the cache so bodyRegions/bodyZones
// reflect it. The cache means the (pure) build runs once per data change.
let activeData: BodyRegionData = BODY_REGION_DATA
let cache: { ant: BodyRegion[]; post: BodyRegion[]; zonesAnt: BodyZone[]; zonesPost: BodyZone[] } | null = null

function built(): NonNullable<typeof cache> {
  if (cache) return cache
  const shared = sharedParts(activeData)
  const ant = buildView('anterior', activeData, shared)
  const post = buildView('posterior', activeData, shared)
  cache = { ant, post, zonesAnt: buildZones(ant), zonesPost: buildZones(post) }
  return cache
}

/**
 * Override the region map at runtime (used by the in-app calibrator to preview a
 * saved calibration in the live chart). Pass null to restore the built-in map.
 * Region NAMES are unchanged by calibration, so burn-TBSA lookups are unaffected.
 */
export function applyRegionData(data: BodyRegionData | null): void {
  activeData = data ?? BODY_REGION_DATA
  cache = null
}

/**
 * Build the region polygons for a view from an arbitrary data object WITHOUT
 * touching the global active map — used by the calibrator to draw a live preview
 * of in-progress edits.
 */
export function buildRegions(data: BodyRegionData, view: BodyView): BodyRegion[] {
  return buildView(view, data, sharedParts(data))
}

/** All anatomical regions for a view (UI render + hit-test share this). */
export function bodyRegions(view: BodyView): ReadonlyArray<BodyRegion> {
  const c = built()
  return view === 'anterior' ? c.ant : c.post
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

function buildZones(regions: ReadonlyArray<BodyRegion>): BodyZone[] {
  const acc = new Map<string, { meta: ReturnType<typeof macroKey>; x1: number; y1: number; x2: number; y2: number }>()
  for (const r of regions) {
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

/** Macro zones (head, neck, torso, each arm/hand/leg/foot) for a view. */
export function bodyZones(view: BodyView): ReadonlyArray<BodyZone> {
  const c = built()
  return view === 'anterior' ? c.zonesAnt : c.zonesPost
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
  for (const r of [...bodyRegions('anterior'), ...bodyRegions('posterior')]) m[r.name] = r.tbsa
  // Coarse names returned only by the off-silhouette band fallback. Don't
  // override real region names that happen to share a label (Chest, Pelvis).
  const fallback: Record<string, number> = {
    Head: 7, Chest: 9, Abdomen: 6, Pelvis: 3, 'Left lower limb': 9, 'Right lower limb': 9,
  }
  for (const [k, v] of Object.entries(fallback)) if (!(k in m)) m[k] = v
  // ("Sole" used to be a back-compat alias for the renamed posterior foot; it's
  // now a real posterior-only region again, so the map supplies its TBSA — and
  // old records saved as "Sole" still resolve to the same 1%.)
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
  for (const r of [...bodyRegions('anterior'), ...bodyRegions('posterior')]){
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
