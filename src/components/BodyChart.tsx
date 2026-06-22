import { useRef } from 'react'
import {
  type BodyView, type Injury, injuryColor, regionAt,
  bodyRegions, BODY_VIEWBOX,
} from '@triage-link/core'

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

// The figure IS the set of anatomical region polygons from the shared model, so
// what is drawn and what is tappable are guaranteed identical.
function Figure({ view }: { view: BodyView }) {
  return (
    <g className="figure">
      {bodyRegions(view).map((rgn, i) => (
        <polygon key={i} className={`zone zone-${rgn.group}`} points={rgn.points.map((p) => p.join(',')).join(' ')} />
      ))}
    </g>
  )
}

export function BodyChart({ view, injuries, selectedId, onPlace, onSelect }: BodyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={`${view} body chart`}
        onClick={handleBackgroundClick}
      >
        <Figure view={view} />
        <g>
          {visible.map((inj) => (
            <g
              key={inj.id}
              className={`marker${inj.id === selectedId ? ' sel' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(inj.id)
              }}
            >
              <circle className="halo" cx={inj.x} cy={inj.y} r={22} />
              <circle cx={inj.x} cy={inj.y} r={13} fill={injuryColor(inj.type)} stroke="#0E1116" strokeWidth={2.5} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
