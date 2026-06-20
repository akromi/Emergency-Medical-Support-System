import { useRef } from 'react'
import type { BodyView, Injury } from '../domain/types'
import { injuryColor } from '../domain/injuries'
import { regionAt } from '../domain/regions'

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

// Shared anatomical silhouette (anterior/posterior use a near-identical outline).
function Silhouette() {
  return (
    <g className="silhouette">
      <circle cx="110" cy="44" r="27" />
      <rect x="98" y="66" width="24" height="16" rx="7" />
      <path d="M70 84 Q110 74 150 84 L156 150 Q150 196 142 232 L78 232 Q70 196 64 150 Z" />
      <path d="M70 88 Q54 92 50 110 L44 196 Q43 214 50 214 Q58 214 60 198 L66 120 Z" />
      <path d="M150 88 Q166 92 170 110 L176 196 Q177 214 170 214 Q162 214 160 198 L154 120 Z" />
      <circle cx="50" cy="220" r="9" />
      <circle cx="170" cy="220" r="9" />
      <path d="M80 232 L104 232 L106 330 Q106 392 98 414 Q92 420 86 414 Q80 392 80 330 Z" />
      <path d="M116 232 L140 232 L140 330 Q140 392 134 414 Q128 420 122 414 Q114 392 114 330 Z" />
      <ellipse cx="90" cy="420" rx="13" ry="7" />
      <ellipse cx="130" cy="420" rx="13" ry="7" />
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
    if (p.x < 20 || p.x > 200 || p.y < 8 || p.y > 434) return
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
        viewBox="0 0 220 440"
        role="img"
        aria-label={`${view} body chart`}
        onClick={handleBackgroundClick}
      >
        <Silhouette />
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
              <circle className="halo" cx={inj.x} cy={inj.y} r={11} />
              <circle cx={inj.x} cy={inj.y} r={6.5} fill={injuryColor(inj.type)} stroke="#0E1116" strokeWidth={1.4} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
