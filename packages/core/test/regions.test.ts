import { describe, it, expect } from 'vitest'
import { regionAt, regionTBSA, estimateBurnTBSA } from '../src/index'

// regionAt(x, y, view) hit-tests the body silhouette (viewBox 0 0 220 440).
// Midline regions carry no side; limbs/shoulders are sided, and the side flips
// between the anterior and posterior views (anatomical position).
describe('regionAt — body-region hit-testing', () => {
  it('resolves midline regions without a side prefix', () => {
    expect(regionAt(110, 44, 'anterior')).toBe('Head')
    expect(regionAt(110, 78, 'anterior')).toBe('Neck')
    expect(regionAt(110, 120, 'anterior')).toBe('Chest')
    expect(regionAt(110, 175, 'anterior')).toBe('Abdomen')
    expect(regionAt(110, 220, 'anterior')).toBe('Pelvis')
  })

  it('gives midline regions identically on both views', () => {
    for (const [x, y] of [[110, 44], [110, 120], [110, 175], [110, 220]] as const) {
      expect(regionAt(x, y, 'anterior')).toBe(regionAt(x, y, 'posterior'))
    }
  })

  it('applies anatomical sidedness: image-left is the patient right on anterior', () => {
    // Left-of-image shoulder box -> patient's RIGHT on the anterior view.
    expect(regionAt(68, 95, 'anterior')).toBe('R Shoulder')
    // Left thigh box -> patient's RIGHT on anterior.
    expect(regionAt(90, 280, 'anterior')).toBe('R Thigh')
  })

  it('flips the side on the posterior view', () => {
    expect(regionAt(68, 95, 'posterior')).toBe('L Shoulder')
    expect(regionAt(90, 280, 'posterior')).toBe('L Thigh')
    // Right-of-image upper arm: L on anterior, R on posterior.
    expect(regionAt(160, 120, 'anterior')).toBe('L Upper arm')
    expect(regionAt(160, 120, 'posterior')).toBe('R Upper arm')
  })

  it('falls back to vertical bands when outside every defined box', () => {
    // Above the head box (y < 14) -> band fallback 'Head'.
    expect(regionAt(110, 8, 'anterior')).toBe('Head')
    // Far to the side, low down -> lower-limb band split on the midline x=110.
    expect(regionAt(10, 300, 'anterior')).toBe('Left lower limb')
    expect(regionAt(210, 300, 'anterior')).toBe('Right lower limb')
  })

  it('resolves distal limb segments precisely (anatomical polygons)', () => {
    expect(regionAt(55, 185, 'anterior')).toBe('R Forearm') // image-left forearm
    expect(regionAt(52, 220, 'anterior')).toBe('R Hand')
    expect(regionAt(92, 370, 'anterior')).toBe('R Lower leg')
    expect(regionAt(92, 420, 'anterior')).toBe('R Foot')
    expect(regionAt(165, 185, 'anterior')).toBe('L Forearm') // image-right forearm
  })
})

describe('burn TBSA estimation', () => {
  it('returns per-region surface percentages, ignoring the side prefix', () => {
    expect(regionTBSA('Chest')).toBe(9)
    expect(regionTBSA('Head')).toBe(4.5)
    expect(regionTBSA('R Thigh')).toBe(4.5)
    expect(regionTBSA('L Forearm')).toBe(1.5)
    expect(regionTBSA('Nowhere')).toBe(0)
  })

  it('sums burns across regions and ignores non-burn injuries', () => {
    const tbsa = estimateBurnTBSA([
      { type: 'burn', region: 'Chest', view: 'anterior' },
      { type: 'burn', region: 'R Thigh', view: 'anterior' },
      { type: 'laceration', region: 'Head', view: 'anterior' }, // ignored
    ])
    expect(tbsa).toBe(13.5) // 9 + 4.5
  })

  it('counts a region/view once but anterior + posterior separately', () => {
    const tbsa = estimateBurnTBSA([
      { type: 'burn', region: 'Chest', view: 'anterior' },
      { type: 'burn', region: 'Chest', view: 'anterior' }, // duplicate marker
      { type: 'burn', region: 'Chest', view: 'posterior' }, // other surface
    ])
    expect(tbsa).toBe(18) // 9 + 9, the duplicate doesn't double-count
  })

  it('caps at 100%', () => {
    const everywhere = ['Head', 'Chest', 'Abdomen', 'Pelvis', 'L Thigh', 'R Thigh', 'L Lower leg', 'R Lower leg']
      .flatMap((region) => (['anterior', 'posterior'] as const).map((view) => ({ type: 'burn', region, view })))
    expect(estimateBurnTBSA(everywhere)).toBeLessThanOrEqual(100)
  })
})
