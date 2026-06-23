// Figure layer config — PRESENTATION ONLY.
//
// The body chart draws a licensed figure image (public/figure/anterior.png,
// posterior.png) positioned by the transform below. It carries NO hit-testing:
// taps are resolved separately by the hidden lookup table in @triage-link/core
// (regionAt / zoneAt over BODY_VIEWBOX). If the image ever fails to load, the
// chart falls back to a faint outline derived from the region polygons
// themselves (see BodyChart), so the fallback can never drift from the regions.
import type { BodyView } from '@triage-link/core'

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
