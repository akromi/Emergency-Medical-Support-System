// Exhaustive anatomical body model in SVG user space. This is the single source
// of truth for BOTH the rendered body chart and regionAt() hit-testing, so the
// drawn figure and the tappable regions can never drift apart.
//
// The figure is a larger, detailed silhouette (head with facial features, arms
// with individual finger phalanges, legs with individual toes) generated from
// primitives so the ~150 regions stay consistent. Image-left parts are authored
// once and mirrored to image-right.
import type { BodyView } from './types.js'

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

/** Trapezoid centred on cx, tapering from wTop (at yTop) to wBot (at yBot). */
const trap = (cx: number, yTop: number, yBot: number, wTop: number, wBot: number): Point[] =>
  [[r1(cx - wTop / 2), yTop], [r1(cx + wTop / 2), yTop], [r1(cx + wBot / 2), yBot], [r1(cx - wBot / 2), yBot]]

/** Stack segment boxes downward from yTop; returns one region per segment. */
function digitDown(
  cx: number, yTop: number, group: RegionGroup, side: 'left',
  label: string, segs: Array<{ seg: string; len: number; w: number; tbsa: number }>,
): RawSide[] {
  let y = yTop
  return segs.map((s) => {
    const region: RawSide = {
      name: `${label} ${s.seg}`, side, group, tbsa: s.tbsa,
      points: box(r1(cx - s.w / 2), y, r1(cx + s.w / 2), y + s.len),
    }
    y += s.len
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
    out.push(
      { name: 'Crown', group: 'head', tbsa: 1, points: box(190, 18, 290, 60) },
      { name: 'Forehead', group: 'face', tbsa: 1, points: box(184, 60, 296, 102) },
      { name: 'Nose', group: 'face', tbsa: 0.3, points: box(226, 112, 254, 156) },
      { name: 'Mouth', group: 'face', tbsa: 0.3, points: box(208, 156, 272, 176) },
      { name: 'Chin', group: 'face', tbsa: 0.4, points: box(204, 176, 276, 198) },
      // Paired (image-left; mirrored below).
      { name: 'Eye', side: 'left', group: 'face', tbsa: 0.3, points: ellipse(208, 116, 20, 11) },
      { name: 'Cheek', side: 'left', group: 'face', tbsa: 0.6, points: box(176, 116, 208, 172) },
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, points: ellipse(168, 124, 11, 24) },
    )
  } else {
    out.push(
      { name: 'Posterior scalp', group: 'head', tbsa: 1.5, points: box(186, 18, 294, 84) },
      { name: 'Occiput', group: 'head', tbsa: 2, points: box(184, 84, 296, 150) },
      { name: 'Nape', group: 'neck', tbsa: 0.5, points: box(206, 150, 274, 198) },
      { name: 'Ear', side: 'left', group: 'face', tbsa: 0.4, points: ellipse(168, 124, 11, 24) },
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

  // Central trunk.
  parts.push(
    { names: { ant: 'Anterior neck', post: 'Posterior neck' }, group: 'neck', tbsa: 0.5, points: box(206, 198, 274, 230) },
    { names: { ant: 'Upper abdomen', post: 'Mid back' }, group: 'trunk', tbsa: 3, points: box(190, 340, 290, 402) },
    { names: { ant: 'Lower abdomen', post: 'Lower back' }, group: 'trunk', tbsa: 3, points: box(196, 402, 284, 456) },
  )

  // Image-left (mirrored later). Authored as side:'left'.
  const left: SharedPart[] = []
  const L = (names: AntPost, group: RegionGroup, tbsa: number, points: ReadonlyArray<Point>): void => {
    left.push({ names, side: 'left', group, tbsa, points })
  }

  L({ ant: 'Shoulder', post: 'Shoulder' }, 'arm', 2, box(120, 230, 178, 290))
  L({ ant: 'Chest', post: 'Upper back' }, 'trunk', 4.5, box(178, 244, 240, 340))
  L({ ant: 'Pelvis', post: 'Buttock' }, 'trunk', 2, box(196, 456, 240, 512))
  L({ ant: 'Upper arm', post: 'Upper arm' }, 'arm', 2, trap(140, 290, 432, 54, 44))
  L({ ant: 'Elbow', post: 'Elbow' }, 'arm', 0.5, box(114, 432, 166, 472))
  L({ ant: 'Forearm', post: 'Forearm' }, 'arm', 1.5, trap(132, 472, 602, 46, 36))
  L({ ant: 'Wrist', post: 'Wrist' }, 'arm', 0.3, box(112, 602, 152, 630))

  // Hand: palm/back, thumb (2 phalanges), four fingers (3 phalanges each).
  L({ ant: 'Palm', post: 'Back of hand' }, 'hand', 0.5, box(102, 630, 162, 698))
  L({ ant: 'Thumb proximal', post: 'Thumb proximal' }, 'hand', 0.1, box(78, 614, 104, 650))
  L({ ant: 'Thumb distal', post: 'Thumb distal' }, 'hand', 0.1, box(72, 586, 98, 620))
  const fingers: Array<{ label: string; cx: number; w: number; lens: [number, number, number] }> = [
    { label: 'Index', cx: 112, w: 13, lens: [30, 26, 24] },
    { label: 'Middle', cx: 128, w: 14, lens: [33, 28, 25] },
    { label: 'Ring', cx: 144, w: 13, lens: [30, 26, 24] },
    { label: 'Little', cx: 157, w: 11, lens: [24, 20, 18] },
  ]
  for (const f of fingers) {
    for (const d of digitDown(f.cx, 698, 'hand', 'left', f.label, [
      { seg: 'proximal', len: f.lens[0], w: f.w, tbsa: 0.06 },
      { seg: 'middle', len: f.lens[1], w: f.w, tbsa: 0.05 },
      { seg: 'distal', len: f.lens[2], w: f.w, tbsa: 0.05 },
    ])) left.push({ names: { ant: d.name, post: d.name }, side: 'left', group: 'hand', tbsa: d.tbsa, points: d.points })
  }

  // Leg.
  L({ ant: 'Thigh', post: 'Thigh' }, 'leg', 4.5, trap(210, 512, 742, 74, 48))
  L({ ant: 'Knee', post: 'Back of knee' }, 'leg', 0.5, box(184, 742, 236, 788))
  L({ ant: 'Shin', post: 'Calf' }, 'leg', 3, trap(206, 788, 950, 48, 34))
  L({ ant: 'Ankle', post: 'Ankle' }, 'leg', 0.5, box(190, 950, 228, 980))
  L({ ant: 'Foot dorsum', post: 'Sole' }, 'foot', 1, box(176, 980, 236, 1018))

  // Toes (great toe is medial → larger x on image-left foot).
  const toes: Array<{ label: string; cx: number; w: number; len: number }> = [
    { label: 'Great toe', cx: 226, w: 18, len: 22 },
    { label: '2nd toe', cx: 208, w: 12, len: 18 },
    { label: '3rd toe', cx: 196, w: 11, len: 17 },
    { label: '4th toe', cx: 185, w: 10, len: 16 },
    { label: '5th toe', cx: 176, w: 9, len: 14 },
  ]
  for (const t of toes) {
    left.push({ names: { ant: t.label, post: t.label }, side: 'left', group: 'foot', tbsa: 0.1, points: box(r1(t.cx - t.w / 2), 1018, r1(t.cx + t.w / 2), 1018 + t.len) })
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

/** TBSA % for a single region's marked aspect (side prefix ignored). */
export function regionTBSA(region: string): number {
  const base = region.replace(/^[LR]\s+/, '')
  return REGION_TBSA[base] ?? 0
}

/**
 * Estimate total burn surface area from marked injuries (rule-of-nines style).
 * Only `burn` injuries count; each distinct region+view is counted once, so
 * anterior and posterior of one region add up while left/right count separately.
 * Capped at 100%.
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
