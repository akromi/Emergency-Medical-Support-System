import { useRef, useState } from 'react'
import {
  type BodyView, type BodyZone, type Injury, injuryColor, regionAt,
  zoneAt, BODY_VIEWBOX,
} from '@triage-link/core'
import { figureMeshPath, figureRimPath } from './figure'

export interface NewInjuryPlacement {
  view: BodyView
  x: number
  y: number
  region: string
}

interface BodyChartProps {
  view: BodyView
  injuries: Injury[]
  selectedId: string | null
  onPlace: (placement: NewInjuryPlacement) => void
  onSelect: (id: string) => void
}

const { width: VW, height: VH } = BODY_VIEWBOX

// The realistic humanoid figure (presentation only) — a teal quad mesh wrapping
// the body. It carries no hit-testing: taps are resolved by coordinate against
// the hidden lookup table in @triage-link/core (regionAt / zoneAt), so nothing
// is overlaid at runtime — only the mesh and the markers are drawn.
function Figure() {
  return (
    <g className="figure">
      <path className="mesh" d={figureMeshPath()} />
      <path className="rim" d={figureRimPath()} />
    </g>
  )
}

export function BodyChart({ view, injuries, selectedId, onPlace, onSelect }: BodyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState<BodyZone | null>(null)

  // Active viewBox: the whole figure, or the blown-up zone bounding box.
  const vb = zoom ? zoom.bbox : { x: 0, y: 0, w: VW, h: VH }
  // Keep marker/handle sizes constant on screen by scaling them with the zoom.
  const k = vb.w / VW

  function toUserSpace(evt: React.MouseEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function handleBackgroundClick(evt: React.MouseEvent) {
    const p = toUserSpace(evt)
    if (!p) return
    if (!zoom) {
      // Full-body view: a tap blows up the macro region under the finger.
      const z = zoneAt(p.x, p.y, view)
      if (z) setZoom(z)
      return
    }
    // Zoomed in: a tap drops a precisely-placed injury marker.
    if (p.x < 0 || p.x > VW || p.y < 0 || p.y > VH) return
    onPlace({
      view,
      x: Number(p.x.toFixed(1)),
      y: Number(p.y.toFixed(1)),
      region: regionAt(p.x, p.y, view),
    })
  }

  const visible = injuries.filter((i) => i.view === view)

  return (
    <div className="bodyview">
      <span className="vlabel">{view === 'anterior' ? 'Anterior · front' : 'Posterior · back'}</span>
      {zoom && (
        <button
          type="button"
          className="zoomout"
          onClick={(e) => {
            e.stopPropagation()
            setZoom(null)
          }}
        >
          ← Full body
        </button>
      )}
      {zoom && <span className="zoomlbl">{zoom.side ? `${zoom.side === 'left' ? 'Patient L' : 'Patient R'} ` : ''}{zoom.name}</span>}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={`${view} body chart${zoom ? ` — ${zoom.name} detail` : ''}`}
        className={zoom ? 'zoomed' : 'overview'}
        onClick={handleBackgroundClick}
      >
        <Figure />
        <g>
          {visible.map((inj) => {
            const a = 7 * k // arm length of the ✕
            return (
              <g
                key={inj.id}
                className={`marker${inj.id === selectedId ? ' sel' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(inj.id)
                }}
              >
                {/* transparent disc keeps the small ✕ easy to tap */}
                <circle className="hit" cx={inj.x} cy={inj.y} r={11 * k} />
                {inj.id === selectedId && <circle className="ring" cx={inj.x} cy={inj.y} r={9 * k} />}
                <line className="x" x1={inj.x - a} y1={inj.y - a} x2={inj.x + a} y2={inj.y + a} stroke={injuryColor(inj.type)} />
                <line className="x" x1={inj.x - a} y1={inj.y + a} x2={inj.x + a} y2={inj.y - a} stroke={injuryColor(inj.type)} />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
