import { describe, it, expect } from 'vitest'
import { regionAt, regionTBSA, estimateBurnTBSA, bodyRegions, zoneAt } from '../src/index'

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

  it('resolves facial features (anterior only)', () => {
    expect(regionAt(240, 158, 'anterior')).toBe('Forehead')
    expect(regionAt(240, 195, 'anterior')).toBe('Nose')
    expect(regionAt(223, 172, 'anterior')).toBe('R Eye') // image-left eye -> patient R
    expect(regionAt(257, 172, 'anterior')).toBe('L Eye')
  })

  it('resolves individual fingers and toes', () => {
    expect(regionAt(28, 543, 'anterior')).toBe('R Index proximal')
    expect(regionAt(42, 546, 'anterior')).toBe('R Middle proximal')
    expect(regionAt(196, 918, 'anterior')).toBe('R Great toe')
    // Mirror across the midline -> patient's LEFT.
    expect(regionAt(480 - 28, 543, 'anterior')).toBe('L Index proximal')
  })

  it('resolves limb and trunk segments with anatomical sidedness', () => {
    expect(regionAt(210, 600, 'anterior')).toBe('R Thigh')
    expect(regionAt(182, 800, 'anterior')).toBe('R Shin')
    expect(regionAt(240, 245, 'anterior')).toBe('Anterior neck')
    expect(regionAt(240, 420, 'anterior')).toBe('Upper abdomen')
    expect(regionAt(210, 300, 'anterior')).toBe('R Chest')
  })

  it('uses posterior names and flips the side on the back view', () => {
    expect(regionAt(240, 180, 'posterior')).toBe('Occiput')
    expect(regionAt(210, 300, 'posterior')).toBe('L Upper back')
    expect(regionAt(182, 800, 'posterior')).toBe('L Calf')
  })

  it('maps a tap to the macro zone of the region under it, not the smallest overlapping bbox', () => {
    // Chest tap: the arm zone's padded bbox overlaps the torso and is smaller,
    // so a bbox-only zoneAt would wrongly zoom the arm.
    expect(regionAt(180, 300, 'anterior')).toBe('R Chest')
    expect(zoneAt(180, 300, 'anterior')?.key).toBe('torso')
    // Upper-thigh / pelvis stays in the torso zone, not an overlapping limb.
    expect(zoneAt(210, 520, 'anterior')?.key).toBe('torso')
    // Distal parts still resolve to their own zone.
    expect(zoneAt(48, 524, 'anterior')?.key).toBe('hand-left')
  })

  it('falls back to vertical bands outside the silhouette', () => {
    expect(regionAt(240, 8, 'anterior')).toBe('Head')
    expect(regionAt(20, 900, 'anterior')).toBe('Left lower limb')
    expect(regionAt(460, 900, 'anterior')).toBe('Right lower limb')
  })
})

describe('burn TBSA estimation', () => {
  it('returns per-region surface percentages, ignoring the side prefix', () => {
    expect(regionTBSA('R Thigh')).toBe(4.5)
    expect(regionTBSA('Palm')).toBe(0.5)
    expect(regionTBSA('R Great toe')).toBe(0.1)
    expect(regionTBSA('Nowhere')).toBe(0)
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
