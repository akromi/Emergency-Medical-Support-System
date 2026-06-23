import { describe, it, expect } from 'vitest'
import { regionAt } from '../src/index'

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
})
