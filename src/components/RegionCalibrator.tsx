// In-app region calibrator (opened with ?calibrate=1). A developer/maintenance
// tool — NOT part of the field casualty workflow, so it is intentionally
// English-only and absent from the guided tour. It lets you drag the tap-region
// handles until they sit perfectly on the figure, preview the result live WITHIN
// this tool, and export the corrected map (body-regions.data.ts JSON).
//
// Workshop-only: it never changes the live field chart. "Save" persists your
// in-progress edits to localStorage so reopening the tool resumes them, and the
// override is applied only while this tool is mounted; the normal app always
// uses the shipped default. A calibration becomes the app default ONLY by
// committing the exported numbers to body-regions.data.ts.
//
// It edits the serialisable BODY_REGION_DATA: you adjust the image-LEFT (and
// centre/head) specs; the right side is mirrored automatically on every rebuild.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type BodyView, type BodyRegionData, type RegionSpec, type FingerSpec, type ToeSpec,
  BODY_REGION_DATA, BODY_VIEWBOX, buildRegions, applyRegionData,
} from '@triage-link/core'
import { FIGURE_IMAGE } from './figure'

const { width: VW, height: VH } = BODY_VIEWBOX
const LS_KEY = 'tl.regions.override'
const r1 = (n: number) => Math.round(n * 10) / 10
const clone = (d: BodyRegionData): BodyRegionData => JSON.parse(JSON.stringify(d))

// ---- Editable address into the data ---------------------------------------
type Addr =
  | { k: 'head'; view: BodyView; i: number }
  | { k: 'central'; i: number }
  | { k: 'left'; i: number }
  | { k: 'finger'; i: number; fi: number }
  | { k: 'toe'; i: number; ti: number }

const addrEq = (a: Addr, b: Addr | null): boolean => !!b && JSON.stringify(a) === JSON.stringify(b)

interface Listed { addr: Addr; label: string }

// Every editable spec for the current view, in a friendly order.
function listSpecs(data: BodyRegionData, view: BodyView): Listed[] {
  const out: Listed[] = []
  data.head[view].forEach((s, i) => out.push({ addr: { k: 'head', view, i }, label: `Head · ${s.name}` }))
  data.central.forEach((s, i) => out.push({ addr: { k: 'central', i }, label: `Centre · ${s.names!.ant}` }))
  data.left.forEach((e, i) => {
    if ('fingers' in e) e.fingers.forEach((f, fi) => out.push({ addr: { k: 'finger', i, fi }, label: `Hand · ${f.label} finger` }))
    else if ('toes' in e) e.toes.forEach((t, ti) => out.push({ addr: { k: 'toe', i, ti }, label: `Foot · ${t.label}` }))
    else out.push({ addr: { k: 'left', i }, label: `Left · ${(e as RegionSpec).names!.ant}` })
  })
  return out
}

function specShape(data: BodyRegionData, addr: Addr): RegionSpec | FingerSpec | ToeSpec {
  switch (addr.k) {
    case 'head': return data.head[addr.view][addr.i]
    case 'central': return data.central[addr.i]
    case 'left': return data.left[addr.i] as RegionSpec
    case 'finger': return (data.left[addr.i] as { fingers: FingerSpec[] }).fingers[addr.fi]
    case 'toe': return (data.left[addr.i] as { toes: ToeSpec[] }).toes[addr.ti]
  }
}

// ---- Handles ---------------------------------------------------------------
interface Handle { id: string; x: number; y: number; role: 'move' | 'pt' }

function handlesFor(spec: RegionSpec | FingerSpec | ToeSpec): Handle[] {
  if ('lens' in spec) { // finger
    const a = (spec.ang * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a)
    const sum = spec.lens[0] + spec.lens[1] + spec.lens[2]
    const tx = spec.rootX + dx * sum, ty = spec.rootY + dy * sum
    const px = dy, py = -dx // perpendicular
    return [
      { id: 'root', x: spec.rootX, y: spec.rootY, role: 'move' },
      { id: 'tip', x: r1(tx), y: r1(ty), role: 'pt' },
      { id: 'width', x: r1(spec.rootX + px * spec.w / 2), y: r1(spec.rootY + py * spec.w / 2), role: 'pt' },
    ]
  }
  if ('cx' in spec && 'len' in spec) { // toe
    return [
      { id: 'top', x: spec.cx, y: spec.yTop, role: 'move' },
      { id: 'br', x: r1(spec.cx + spec.w / 2), y: spec.yTop + spec.len, role: 'pt' },
    ]
  }
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box') return [
    { id: 'c', x: r1((s.x1 + s.x2) / 2), y: r1((s.y1 + s.y2) / 2), role: 'move' },
    { id: 'nw', x: s.x1, y: s.y1, role: 'pt' }, { id: 'ne', x: s.x2, y: s.y1, role: 'pt' },
    { id: 'se', x: s.x2, y: s.y2, role: 'pt' }, { id: 'sw', x: s.x1, y: s.y2, role: 'pt' },
  ]
  if (s.kind === 'ellipse') return [
    { id: 'c', x: s.cx, y: s.cy, role: 'move' },
    { id: 'e', x: r1(s.cx + s.rx), y: s.cy, role: 'pt' }, { id: 's', x: s.cx, y: r1(s.cy + s.ry), role: 'pt' },
  ]
  // quad
  return [
    { id: 'c', x: r1((s.cxTop + s.cxBot) / 2), y: r1((s.yTop + s.yBot) / 2), role: 'move' },
    { id: 'tl', x: r1(s.cxTop - s.wTop / 2), y: s.yTop, role: 'pt' }, { id: 'tr', x: r1(s.cxTop + s.wTop / 2), y: s.yTop, role: 'pt' },
    { id: 'br', x: r1(s.cxBot + s.wBot / 2), y: s.yBot, role: 'pt' }, { id: 'bl', x: r1(s.cxBot - s.wBot / 2), y: s.yBot, role: 'pt' },
  ]
}

// Apply a drag of handle `id` to user-space (px,py). Mutates spec in place.
function dragHandle(spec: RegionSpec | FingerSpec | ToeSpec, id: string, px: number, py: number, prev: Handle): void {
  const MIN = 2
  if ('lens' in spec) { // finger
    if (id === 'root') { spec.rootX = r1(px); spec.rootY = r1(py); return }
    if (id === 'tip') {
      const vx = px - spec.rootX, vy = py - spec.rootY, L = Math.hypot(vx, vy) || 1
      spec.ang = r1((Math.atan2(vx, vy) * 180) / Math.PI)
      const sum = spec.lens[0] + spec.lens[1] + spec.lens[2] || 1
      spec.lens = [r1(spec.lens[0] * L / sum), r1(spec.lens[1] * L / sum), r1(spec.lens[2] * L / sum)] as [number, number, number]
      return
    }
    if (id === 'width') { spec.w = r1(Math.max(MIN, 2 * Math.hypot(px - spec.rootX, py - spec.rootY))); return }
    return
  }
  if ('cx' in spec && 'len' in spec) { // toe
    if (id === 'top') { spec.cx = r1(px); spec.yTop = r1(py); return }
    if (id === 'br') { spec.w = r1(Math.max(MIN, 2 * (px - spec.cx))); spec.len = r1(Math.max(MIN, py - spec.yTop)); return }
    return
  }
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box') {
    if (id === 'c') { const dx = px - prev.x, dy = py - prev.y; s.x1 = r1(s.x1 + dx); s.x2 = r1(s.x2 + dx); s.y1 = r1(s.y1 + dy); s.y2 = r1(s.y2 + dy); return }
    if (id.includes('w')) s.x1 = r1(Math.min(px, s.x2 - MIN)); if (id.includes('e')) s.x2 = r1(Math.max(px, s.x1 + MIN))
    if (id.startsWith('n')) s.y1 = r1(Math.min(py, s.y2 - MIN)); if (id.startsWith('s')) s.y2 = r1(Math.max(py, s.y1 + MIN))
    return
  }
  if (s.kind === 'ellipse') {
    if (id === 'c') { s.cx = r1(px); s.cy = r1(py); return }
    if (id === 'e') { s.rx = r1(Math.max(MIN, Math.abs(px - s.cx))); return }
    if (id === 's') { s.ry = r1(Math.max(MIN, Math.abs(py - s.cy))); return }
    return
  }
  // quad
  if (id === 'c') { const dx = px - prev.x, dy = py - prev.y; s.cxTop = r1(s.cxTop + dx); s.cxBot = r1(s.cxBot + dx); s.yTop = r1(s.yTop + dy); s.yBot = r1(s.yBot + dy); return }
  if (id === 'tl') { const xTR = s.cxTop + s.wTop / 2; s.cxTop = r1((Math.min(px, xTR - MIN) + xTR) / 2); s.wTop = r1(Math.max(MIN, xTR - px)); s.yTop = r1(py) }
  if (id === 'tr') { const xTL = s.cxTop - s.wTop / 2; s.cxTop = r1((xTL + Math.max(px, xTL + MIN)) / 2); s.wTop = r1(Math.max(MIN, px - xTL)); s.yTop = r1(py) }
  if (id === 'bl') { const xBR = s.cxBot + s.wBot / 2; s.cxBot = r1((Math.min(px, xBR - MIN) + xBR) / 2); s.wBot = r1(Math.max(MIN, xBR - px)); s.yBot = r1(py) }
  if (id === 'br') { const xBL = s.cxBot - s.wBot / 2; s.cxBot = r1((xBL + Math.max(px, xBL + MIN)) / 2); s.wBot = r1(Math.max(MIN, px - xBL)); s.yBot = r1(py) }
}

// ---- Component -------------------------------------------------------------
// Shape-guard the persisted edits: only accept a well-formed BodyRegionData, so
// a stale/garbage localStorage value can never reach buildRegions and throw.
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isShapeSpec(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  switch (o.kind) {
    case 'box': return [o.x1, o.y1, o.x2, o.y2].every(isNum)
    case 'ellipse': return [o.cx, o.cy, o.rx, o.ry].every(isNum)
    case 'quad': return [o.cxTop, o.yTop, o.wTop, o.cxBot, o.yBot, o.wBot].every(isNum)
    default: return false
  }
}

function isRegionSpec(s: unknown): boolean {
  return !!s && typeof s === 'object' && isShapeSpec((s as RegionSpec).shape)
}

function isFingerSpec(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const o = s as FingerSpec
  return typeof o.label === 'string' && isNum(o.rootX) && isNum(o.rootY) && isNum(o.ang) && isNum(o.w)
    && Array.isArray(o.lens) && o.lens.length === 3 && o.lens.every(isNum)
    && Array.isArray(o.tbsa) && o.tbsa.length === 3 && o.tbsa.every(isNum)
}

function isToeSpec(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const o = s as ToeSpec
  return typeof o.label === 'string' && isNum(o.cx) && isNum(o.w) && isNum(o.len) && isNum(o.yTop)
}

function isLeftEntry(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  if ('fingers' in e) return Array.isArray((e as { fingers: unknown }).fingers) && (e as { fingers: unknown[] }).fingers.every(isFingerSpec)
  if ('toes' in e) return Array.isArray((e as { toes: unknown }).toes) && (e as { toes: unknown[] }).toes.every(isToeSpec)
  return isRegionSpec(e)
}

function isRegionData(d: unknown): d is BodyRegionData {
  const o = d as BodyRegionData | null
  return !!o && typeof o === 'object'
    && !!o.head && Array.isArray(o.head.anterior) && o.head.anterior.every(isRegionSpec)
    && Array.isArray(o.head.posterior) && o.head.posterior.every(isRegionSpec)
    && Array.isArray(o.central) && o.central.every(isRegionSpec)
    && Array.isArray(o.left) && o.left.every(isLeftEntry)
}

function loadSaved(): BodyRegionData | null {
  try { const d = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'); return isRegionData(d) ? d : null } catch { return null }
}

export function RegionCalibrator() {
  const [view, setView] = useState<BodyView>('anterior')
  const [data, setData] = useState<BodyRegionData>(() => loadSaved() ?? clone(BODY_REGION_DATA))
  const [sel, setSel] = useState<Addr | null>(null)
  const [drag, setDrag] = useState<{ id: string; prev: Handle } | null>(null)
  const [savedAt, setSavedAt] = useState<string>('')
  const svgRef = useRef<SVGSVGElement>(null)

  // Preview edits live WHILE the tool is mounted; restore the shipped default on
  // exit so the override never leaks into the normal app.
  useEffect(() => { applyRegionData(data) }, [data])
  useEffect(() => () => { applyRegionData(null) }, [])

  const regions = useMemo(() => buildRegions(data, view), [data, view])
  const specs = useMemo(() => listSpecs(data, view), [data, view])
  const selSpec = sel ? specShape(data, sel) : null
  const handles = selSpec ? handlesFor(selSpec) : []

  function toUser(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current; if (!svg) return null
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM(); if (!ctm) return null
    const p = pt.matrixTransform(ctm.inverse()); return { x: p.x, y: p.y }
  }

  function onMove(e: React.PointerEvent) {
    if (!drag || !sel) return
    const p = toUser(e); if (!p) return
    setData((d) => { const nd = clone(d); dragHandle(specShape(nd, sel), drag.id, p.x, p.y, drag.prev); return nd })
    setDrag((dr) => dr && { ...dr, prev: { ...dr.prev, x: p.x, y: p.y } })
  }

  // Head specs are view-specific (their index means a different region per
  // view), so a head selection must be dropped when the view changes — otherwise
  // its handles/drags would edit the OTHER view's head spec. Shared regions
  // (centre/left/finger/toe) are view-independent and stay selected.
  function toggleView() {
    setView((v) => (v === 'anterior' ? 'posterior' : 'anterior'))
    setSel((s) => (s && s.k === 'head' ? null : s))
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); setSavedAt(new Date().toLocaleTimeString()) } catch { /* ignore */ }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = 'body-regions.data.json'; a.click(); URL.revokeObjectURL(url)
  }
  function reset() {
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    setData(clone(BODY_REGION_DATA)); setSel(null); setSavedAt('')
  }

  const img = FIGURE_IMAGE[view]
  const hsz = 5 // handle radius in user units

  return (
    <div className="calib">
      <div className="calib-bar">
        <strong>Region calibrator</strong>
        <button type="button" onClick={toggleView}>View: {view}</button>
        <select value={sel ? specs.findIndex((s) => addrEq(s.addr, sel)) : -1}
          onChange={(e) => setSel(Number(e.target.value) >= 0 ? specs[Number(e.target.value)].addr : null)}>
          <option value={-1}>— pick a region —</option>
          {specs.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
        </select>
        <button type="button" onClick={save}>Save</button>
        <button type="button" onClick={exportJson}>Export JSON</button>
        <button type="button" onClick={reset}>Reset to built-in</button>
        {savedAt && <span className="calib-note">saved {savedAt} — resumes here; Export &amp; commit to make it the app default</span>}
      </div>
      <div className="calib-hint">
        Drag the round handles onto the figure. Edit the image-LEFT / centre / head regions; the
        right side mirrors automatically. Selected: <strong>{sel ? specs.find((s) => addrEq(s.addr, sel))?.label : 'none'}</strong>.
        Coordinates are SVG units (0–{VW} × 0–{VH}).
      </div>
      <svg
        ref={svgRef}
        className="calib-svg"
        viewBox={`0 0 ${VW} ${VH}`}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <image href={img.href} x={0} y={0} width={img.w} height={img.h} transform={img.align} preserveAspectRatio="none" />
        {regions.map((rg, i) => (
          <polygon key={i} className="calib-poly" points={rg.points.map(([x, y]) => `${x},${y}`).join(' ')} />
        ))}
        {handles.map((h) => (
          <circle
            key={h.id}
            className={`calib-h ${h.role}`}
            cx={h.x} cy={h.y} r={hsz}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: h.id, prev: { ...h } }) }}
          />
        ))}
      </svg>
    </div>
  )
}
