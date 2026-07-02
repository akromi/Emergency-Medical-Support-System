import { describe, it, expect, afterEach } from 'vitest'
import {
  regionAt, regionTBSA, estimateBurnTBSA, bodyRegions, zoneAt,
  applyRegionData, buildRegions, BODY_REGION_DATA, type BodyRegionData,
} from '../src/index'

// regionAt(x, y, view) hit-tests the anatomical body model (body-model.ts) in
// SVG user space (480 x 1040). Image-left maps to the patient's RIGHT on the
// anterior view; the posterior view flips the side.
describe('regionAt — anatomical hit-testing', () => {
  it('exposes an exhaustive region set (100+ across both views)', () => {
    const total = bodyRegions('anterior').length + bodyRegions('posterior').length
    expect(total).toBeGreaterThanOrEqual(100)
    const names = new Set([...bodyRegions('anterior'), ...bodyRegions('posterior')].map((r) => r.name))
    for (const part of ['Nose', 'Eye', 'Palm', 'Index distal', 'Great toe', 'Occiput', 'Calf']) {
      expect(names).toContain(part)
    }
  })

  // Coordinates below are fitted to public/figure/{anterior,posterior}.png:
  // facial features sit higher and the ear is reachable (it used to fall through
  // to Cheek/Head). See body-model.ts headRegions().
  // Sample points below are region centroids in the applied (calibrated) map —
  // see body-regions.data.ts. They move when the map is re-calibrated; what they
  // assert (a tap lands on the right region/side) does not.
  it('resolves facial features (anterior only)', () => {
    expect(regionAt(240, 147, 'anterior')).toBe('Forehead')
    expect(regionAt(240, 168, 'anterior')).toBe('Nose')
    expect(regionAt(240, 186, 'anterior')).toBe('Mouth')
    expect(regionAt(242, 200, 'anterior')).toBe('Chin')
    expect(regionAt(226, 157, 'anterior')).toBe('R Eye') // image-left eye -> patient R
    expect(regionAt(254, 157, 'anterior')).toBe('L Eye')
  })

  it('resolves the ear at the side of the head (regression: was Cheek/Head)', () => {
    expect(regionAt(206, 174, 'anterior')).toBe('R Ear')
    expect(regionAt(274, 174, 'anterior')).toBe('L Ear')
    expect(regionAt(200, 170, 'posterior')).toBe('L Ear')
  })

  it('resolves individual fingers and toes', () => {
    expect(regionAt(30, 524, 'anterior')).toBe('R Index proximal')
    expect(regionAt(39, 531, 'anterior')).toBe('R Middle proximal')
    expect(regionAt(175, 918, 'anterior')).toBe('R Great toe')
    // Mirror across the midline -> patient's LEFT.
    expect(regionAt(441, 531, 'anterior')).toBe('L Middle proximal')
  })

  it('resolves limb and trunk segments with anatomical sidedness', () => {
    expect(regionAt(210, 600, 'anterior')).toBe('R Thigh')
    expect(regionAt(193, 687, 'anterior')).toBe('R Knee') // patella, not the thigh above it
    // The Thigh and Knee polygons overlap by a few px at the top of the patella;
    // the finer Knee (priority) wins that band over the larger Thigh.
    expect(regionAt(200, 665, 'anterior')).toBe('R Knee')
    expect(regionAt(193, 811, 'anterior')).toBe('R Shin')
    // No gap between the knee's lower edge and the shin: a tap just below the
    // knee resolves to a leg segment, never the coarse vertical-band fallback.
    expect(regionAt(190, 730, 'anterior')).toBe('R Shin')
    expect(regionAt(240, 245, 'anterior')).toBe('Anterior neck')
    expect(regionAt(240, 420, 'anterior')).toBe('Upper abdomen')
    expect(regionAt(210, 300, 'anterior')).toBe('R Chest')
    // Centre-line groin between the legs wins the tap over the flanking Pelvis.
    expect(regionAt(240, 535, 'anterior')).toBe('Groin')
  })

  it('uses posterior names and flips the side on the back view', () => {
    expect(regionAt(240, 180, 'posterior')).toBe('Occiput')
    expect(regionAt(210, 300, 'posterior')).toBe('L Upper back')
    expect(regionAt(182, 800, 'posterior')).toBe('L Calf')
    expect(regionAt(240, 535, 'posterior')).toBe('Perineum')
    // The lower buttock (below the lower-back overlap, beside the central
    // Perineum) records Buttock — not Thigh, and not the central Perineum.
    expect(regionAt(220, 535, 'posterior')).toBe('L Buttock')
    expect(regionAt(260, 535, 'posterior')).toBe('R Buttock')
    // The upper back-of-foot is the Heel; the lower band is the (posterior-only)
    // Sole, which wins there by priority.
    expect(regionAt(177, 896, 'posterior')).toBe('L Heel')
    expect(regionAt(177, 920, 'posterior')).toBe('L Sole')
  })

  it('exposes the Sole on both views (dorsal arch + plantar band), each view-specific', () => {
    expect(bodyRegions('anterior').some((r) => r.name === 'Sole')).toBe(true)
    expect(bodyRegions('posterior').some((r) => r.name === 'Sole')).toBe(true)
    // Anterior: the medial-arch box wins over the foot dorsum.
    expect(regionAt(185, 890, 'anterior')).toBe('R Sole')
    // Posterior: the plantar band wins over the heel.
    expect(regionAt(177, 920, 'posterior')).toBe('L Sole')
    // The two twins are view-specific: the anterior arch spot isn't the Sole on
    // the back (it's the Heel there), and the posterior band spot isn't the Sole
    // on the front (it's the foot dorsum / toe there).
    expect(regionAt(185, 890, 'posterior')).toBe('L Heel')
    expect(regionAt(177, 920, 'anterior')).not.toContain('Sole')
  })

  it('shows toes only on the anterior view (their tops aren’t visible from behind)', () => {
    expect(bodyRegions('anterior').some((r) => r.name === 'Great toe')).toBe(true)
    expect(bodyRegions('posterior').some((r) => r.name === 'Great toe')).toBe(false)
    // A toe tap resolves to the toe on the front; on the back the toe footprint
    // rolls into a foot region (here the Sole band) — NOT the coarse limb
    // fallback, which would wrongly score ~9% instead of the foot's ~1%.
    expect(regionAt(175, 918, 'anterior')).toBe('R Great toe')
    expect(regionAt(175, 918, 'posterior')).toBe('L Sole')
  })

  it('maps a tap to the macro zone of the region under it, not the smallest overlapping bbox', () => {
    // Chest tap: the arm zone's padded bbox overlaps the torso and is smaller,
    // so a bbox-only zoneAt would wrongly zoom the arm.
    expect(regionAt(180, 300, 'anterior')).toBe('R Chest')
    expect(zoneAt(180, 300, 'anterior')?.key).toBe('torso')
    // Pelvis stays in the torso zone, not an overlapping limb.
    expect(zoneAt(200, 495, 'anterior')?.key).toBe('torso')
    // Distal parts still resolve to their own zone.
    expect(zoneAt(48, 524, 'anterior')?.key).toBe('hand-left')
  })

  it('falls back to vertical bands outside the silhouette', () => {
    expect(regionAt(240, 8, 'anterior')).toBe('Head')
    expect(regionAt(20, 900, 'anterior')).toBe('Left lower limb')
    expect(regionAt(460, 900, 'anterior')).toBe('Right lower limb')
  })
})

// The region map is data-driven (body-regions.data.ts) so the in-app calibrator
// can refit it. These lock the data API the calibrator depends on.
describe('data-driven region map', () => {
  afterEach(() => applyRegionData(null)) // always restore the built-in map

  const cloneData = (): BodyRegionData => JSON.parse(JSON.stringify(BODY_REGION_DATA))

  it('buildRegions(default) matches the live map without touching global state', () => {
    expect(buildRegions(BODY_REGION_DATA, 'anterior')).toEqual(bodyRegions('anterior'))
    expect(buildRegions(BODY_REGION_DATA, 'posterior')).toEqual(bodyRegions('posterior'))
    // pure: calling it did not change the active map
    expect(regionAt(226, 160, 'anterior')).toBe('R Eye')
  })

  it('applyRegionData overrides hit-testing and mirrors the edit; null restores', () => {
    const d = cloneData()
    const eye = d.head.anterior.find((s) => s.name === 'Eye')!
    if (eye.shape.kind === 'ellipse') { eye.shape.cy = 260 } // move the eye far down
    applyRegionData(d)
    expect(regionAt(226, 160, 'anterior')).not.toBe('R Eye') // old spot no longer the eye
    expect(regionAt(226, 260, 'anterior')).toBe('R Eye')      // new spot is
    expect(regionAt(254, 260, 'anterior')).toBe('L Eye')      // mirror followed
    applyRegionData(null)
    expect(regionAt(226, 160, 'anterior')).toBe('R Eye')      // restored
  })

  it('applies a box/ellipse rotation to the polygon', () => {
    const d = cloneData()
    const eye = d.head.anterior.find((s) => s.name === 'Eye')!
    // The eye ellipse is wide & short (rx 9, ry 4.4). A point ~6 below its centre
    // is outside when flat, but inside once rotated 90° (vertical axis → 9).
    expect(regionAt(226, 163, 'anterior')).not.toBe('R Eye')
    if (eye.shape.kind === 'ellipse') eye.shape.rot = 90
    applyRegionData(d)
    expect(regionAt(226, 163, 'anterior')).toBe('R Eye')
  })

  it('rotates a toe about its root (cx, yTop)', () => {
    const d = cloneData()
    const toes = (d.left.find((e) => 'toes' in e) as {
      toes: Array<{ label: string; cx: number; w: number; len: number; yTop: number; ang?: number }>
    }).toes
    const great = toes.find((t) => t.label === 'Great toe')!
    // Pin a known flat geometry so the assertion doesn't ride on the shipped
    // calibration: a 12×24 box hanging from the root (180, 905), corners span
    // x∈[174,186], y∈[905,929].
    great.cx = 180; great.w = 12; great.len = 24; great.yTop = 905; great.ang = 90
    // Rotating 90° clockwise about the root sends each corner (dx, dy) → (-dy, dx):
    // the footprint swings left of the root (x∈[156,180]) and its length becomes
    // the width span (y∈[899,911]).
    const toe = buildRegions(d, 'anterior').find((r) => r.name === 'Great toe' && r.side === 'left')!
    const xs = toe.points.map((p) => p[0]), ys = toe.points.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(156, 1)
    expect(Math.max(...xs)).toBeCloseTo(180, 1)
    expect(Math.min(...ys)).toBeCloseTo(899, 1)
    expect(Math.max(...ys)).toBeCloseTo(911, 1)
  })

  it('builds, hit-tests and mirrors a free polygon shape', () => {
    const d = cloneData()
    // Re-trace the Nose as an explicit triangle (calibrator "Shape ▸ Triangle").
    const nose = d.head.anterior.find((s) => s.name === 'Nose')!
    nose.side = 'left' // make it a mirrored part so we can assert the mirror too
    nose.shape = { kind: 'polygon', pts: [[230, 156], [248, 184], [218, 184]] }
    applyRegionData(d)
    // The polygon renders with exactly its given vertices (image-left copy)…
    const built = buildRegions(d, 'anterior')
    const poly = built.find((r) => r.name === 'Nose' && r.side === 'left')!
    expect(poly.points).toEqual([[230, 156], [248, 184], [218, 184]])
    // …a point inside the triangle resolves to it (image-left → patient's R),
    // one outside (above the apex) does not…
    expect(regionAt(232, 178, 'anterior')).toBe('R Nose')
    expect(regionAt(232, 150, 'anterior')).not.toContain('Nose')
    // …and the side:'left' polygon was mirrored about the centre line (x → 480-x).
    const mirror = built.find((r) => r.name === 'Nose' && r.side === 'right')!
    expect(mirror.points).toEqual([[250, 156], [232, 184], [262, 184]])
  })

  it('equal-priority hit-test still follows authored order (stable default)', () => {
    const d = cloneData()
    // Two regions on the exact same spot; with equal (default 0) priority the
    // FIRST in the list wins — the authored order is preserved by a stable sort.
    const here = { kind: 'box', x1: 300, y1: 300, x2: 340, y2: 340 } as const
    d.head.anterior.unshift(
      { name: 'AAA', group: 'face', tbsa: 0, shape: { ...here } },
      { name: 'BBB', group: 'face', tbsa: 0, shape: { ...here } },
    )
    applyRegionData(d)
    expect(regionAt(320, 320, 'anterior')).toBe('AAA')

    const [bbb] = d.head.anterior.splice(1, 1)
    d.head.anterior.unshift(bbb)
    applyRegionData(d)
    expect(regionAt(320, 320, 'anterior')).toBe('BBB')
  })

  it('priority overrides authored order ACROSS groups (calibrator Front/Back)', () => {
    const d = cloneData()
    const here = { kind: 'box', x1: 300, y1: 300, x2: 340, y2: 340 } as const
    // A head-group region and a centre (trunk) region overlap the same spot.
    d.head.anterior.push({ name: 'HEAD2', group: 'face', tbsa: 0, shape: { ...here } })
    d.central.push({ names: { ant: 'CTR', post: 'CTR' }, group: 'trunk', tbsa: 0, shape: { ...here } })
    applyRegionData(d)
    // By default the head bucket builds before shared parts, so HEAD2 wins.
    expect(regionAt(320, 320, 'anterior')).toBe('HEAD2')

    // Raise the centre region's priority (what ⤒ Front does) → it now wins the
    // overlap even though it's in a different, normally-lower group.
    d.central[d.central.length - 1].priority = 5
    applyRegionData(d)
    expect(regionAt(320, 320, 'anterior')).toBe('CTR')
  })

  it('keeps burn-TBSA stable (calibration moves positions, not names/tbsa)', () => {
    const d = cloneData()
    const knee = d.left.find((e) => 'names' in e && e.names?.ant === 'Knee') as
      { shape: { kind: string; pts?: Array<[number, number]>; y1?: number; y2?: number } }
    // The shipped map traces the knee as a polygon; shove every vertex down the
    // leg so the override genuinely moves it (a no-op override would prove nothing).
    const s = knee.shape
    if (s.kind === 'polygon' && s.pts) s.pts = s.pts.map(([x, y]) => [x, y + 120] as [number, number])
    else if (s.kind === 'box' && s.y1 != null && s.y2 != null) { s.y1 += 120; s.y2 += 120 }
    applyRegionData(d)
    // The knee really moved (its old patella spot is no longer the knee)…
    expect(regionAt(193, 687, 'anterior')).not.toBe('R Knee')
    // …yet TBSA comes from the static table, unaffected by geometry.
    expect(regionTBSA('R Knee')).toBe(0.5)
    expect(regionTBSA('R Thigh')).toBe(4.5)
  })
})

describe('burn TBSA estimation', () => {
  it('returns per-region surface percentages, ignoring the side prefix', () => {
    expect(regionTBSA('R Thigh')).toBe(4.5)
    expect(regionTBSA('Palm')).toBe(0.5)
    expect(regionTBSA('R Great toe')).toBe(0.1)
    expect(regionTBSA('Nowhere')).toBe(0)
  })

  it('scores the foot aspects (Heel and the posterior-only Sole) at 1%', () => {
    // "Sole" is now a real posterior-only region; both back-of-foot aspects
    // contribute 1% (and old records saved as "Sole" still resolve to 1%).
    expect(regionTBSA('Heel')).toBe(1)
    expect(regionTBSA('Sole')).toBe(1)
    expect(regionTBSA('L Sole')).toBe(1)
  })

  it('sums burns across regions, ignoring non-burn injuries', () => {
    const tbsa = estimateBurnTBSA([
      { type: 'burn', region: 'R Thigh', view: 'anterior' },
      { type: 'burn', region: 'R Chest', view: 'anterior' },
      { type: 'laceration', region: 'Nose', view: 'anterior' }, // ignored
    ])
    expect(tbsa).toBe(9) // 4.5 + 4.5
  })

  it('counts a region/view once but anterior + posterior separately, capped at 100', () => {
    const dup = estimateBurnTBSA([
      { type: 'burn', region: 'R Thigh', view: 'anterior' },
      { type: 'burn', region: 'R Thigh', view: 'anterior' }, // duplicate
      { type: 'burn', region: 'R Thigh', view: 'posterior' }, // other surface
    ])
    expect(dup).toBe(9) // 4.5 + 4.5, duplicate ignored

    const everything = (['anterior', 'posterior'] as const).flatMap((view) =>
      bodyRegions(view).map((r) => ({ type: 'burn', region: r.name, view })),
    )
    expect(estimateBurnTBSA(everything)).toBeLessThanOrEqual(100)
  })
})

describe('Lund–Browder age adjustment', () => {
  it('scales head up and legs down for children; adult is the base', () => {
    // Adult = unchanged base values.
    expect(regionTBSA('Forehead', 'adult')).toBe(1)
    expect(regionTBSA('R Thigh', 'adult')).toBe(4.5)
    // Infant: head larger, legs smaller (Lund–Browder).
    expect(regionTBSA('Forehead', 'infant')).toBeCloseTo(2.71, 2) // ×9.5/3.5
    expect(regionTBSA('R Thigh', 'infant')).toBeCloseTo(2.61, 2) // ×2.75/4.75
    expect(regionTBSA('R Shin', 'infant')).toBeCloseTo(2.14, 2) // ×2.5/3.5
    // Trunk is constant across ages.
    expect(regionTBSA('R Chest', 'infant')).toBe(regionTBSA('R Chest', 'adult'))
  })

  it('makes infant head burns count more and leg burns less than adult', () => {
    const head = [{ type: 'burn', region: 'Forehead', view: 'anterior' as const }]
    expect(estimateBurnTBSA(head, 'infant')).toBeGreaterThan(estimateBurnTBSA(head, 'adult'))
    const leg = [{ type: 'burn', region: 'R Thigh', view: 'anterior' as const }]
    expect(estimateBurnTBSA(leg, 'infant')).toBeLessThan(estimateBurnTBSA(leg, 'adult'))
  })

  it('defaults to adult when no age band is given', () => {
    const b = [{ type: 'burn', region: 'R Thigh', view: 'anterior' as const }]
    expect(estimateBurnTBSA(b)).toBe(estimateBurnTBSA(b, 'adult'))
  })
})
