import type { BodyView } from './types.js'

// Rectangular hit-test zones in the body-chart's SVG user space (viewBox 0 0 220 440).
// A future iteration replaces these with a precise anatomical SVG.
interface RegionBox {
  name: string
  x1: number; x2: number; y1: number; y2: number
  imgSide?: 'left' | 'right'
}

const REGIONS: RegionBox[] = [
  { name: 'Head',      x1: 80,  x2: 140, y1: 14,  y2: 72 },
  { name: 'Neck',      x1: 96,  x2: 124, y1: 72,  y2: 84 },
  { name: 'Shoulder',  x1: 60,  x2: 80,  y1: 82,  y2: 104, imgSide: 'left' },
  { name: 'Shoulder',  x1: 140, x2: 160, y1: 82,  y2: 104, imgSide: 'right' },
  { name: 'Chest',     x1: 70,  x2: 150, y1: 84,  y2: 150 },
  { name: 'Abdomen',   x1: 74,  x2: 146, y1: 150, y2: 200 },
  { name: 'Pelvis',    x1: 74,  x2: 146, y1: 200, y2: 240 },
  { name: 'Upper arm', x1: 44,  x2: 70,  y1: 88,  y2: 160, imgSide: 'left' },
  { name: 'Upper arm', x1: 150, x2: 176, y1: 88,  y2: 160, imgSide: 'right' },
  { name: 'Forearm',   x1: 42,  x2: 68,  y1: 160, y2: 212, imgSide: 'left' },
  { name: 'Forearm',   x1: 152, x2: 178, y1: 160, y2: 212, imgSide: 'right' },
  { name: 'Hand',      x1: 40,  x2: 62,  y1: 210, y2: 236, imgSide: 'left' },
  { name: 'Hand',      x1: 158, x2: 180, y1: 210, y2: 236, imgSide: 'right' },
  { name: 'Thigh',     x1: 76,  x2: 108, y1: 236, y2: 330, imgSide: 'left' },
  { name: 'Thigh',     x1: 112, x2: 144, y1: 236, y2: 330, imgSide: 'right' },
  { name: 'Lower leg', x1: 78,  x2: 108, y1: 330, y2: 410, imgSide: 'left' },
  { name: 'Lower leg', x1: 114, x2: 142, y1: 330, y2: 410, imgSide: 'right' },
  { name: 'Foot',      x1: 76,  x2: 106, y1: 410, y2: 430, imgSide: 'left' },
  { name: 'Foot',      x1: 114, x2: 146, y1: 410, y2: 430, imgSide: 'right' },
]

// Anatomical position: anterior view -> image-left is the patient's RIGHT.
// Posterior view flips it.
function anatomicalSide(imgSide: 'left' | 'right' | undefined, view: BodyView): string {
  if (!imgSide) return ''
  if (view === 'anterior') return imgSide === 'left' ? 'R ' : 'L '
  return imgSide === 'left' ? 'L ' : 'R '
}

export function regionAt(x: number, y: number, view: BodyView): string {
  for (const r of REGIONS) {
    if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
      return anatomicalSide(r.imgSide, view) + r.name
    }
  }
  // Fallback by vertical band when outside a defined box.
  if (y < 72) return 'Head'
  if (y < 150) return 'Chest'
  if (y < 200) return 'Abdomen'
  if (y < 240) return 'Pelvis'
  return x < 110 ? 'Left lower limb' : 'Right lower limb'
}
