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

// Bounding box (SVG units) of a spec, so the editor can zoom in on the selection.
// `mirror` unions in the mirrored copy (about the centre line) so a paired head
// feature shows BOTH sides when zoomed — its right-side mirror isn't cropped out.
function specBBox(spec: RegionSpec | FingerSpec | ToeSpec, mirror = false): { x: number; y: number; w: number; h: number } {
  let x1: number, y1: number, x2: number, y2: number
  if ('lens' in spec) { // finger
    const a = (spec.ang * Math.PI) / 180, sum = spec.lens[0] + spec.lens[1] + spec.lens[2]
    const tx = spec.rootX + Math.sin(a) * sum, ty = spec.rootY + Math.cos(a) * sum, m = spec.w
    x1 = Math.min(spec.rootX, tx) - m; x2 = Math.max(spec.rootX, tx) + m
    y1 = Math.min(spec.rootY, ty) - m; y2 = Math.max(spec.rootY, ty) + m
  } else if ('cx' in spec && 'len' in spec) { // toe
    x1 = spec.cx - spec.w / 2; x2 = spec.cx + spec.w / 2; y1 = spec.yTop; y2 = spec.yTop + spec.len
  } else {
    const s = (spec as RegionSpec).shape
    if (s.kind === 'box') { x1 = s.x1; y1 = s.y1; x2 = s.x2; y2 = s.y2 }
    else if (s.kind === 'ellipse') { x1 = s.cx - s.rx; y1 = s.cy - s.ry; x2 = s.cx + s.rx; y2 = s.cy + s.ry }
    else { const xs = [s.cxTop - s.wTop / 2, s.cxTop + s.wTop / 2, s.cxBot - s.wBot / 2, s.cxBot + s.wBot / 2]; x1 = Math.min(...xs); x2 = Math.max(...xs); y1 = Math.min(s.yTop, s.yBot); y2 = Math.max(s.yTop, s.yBot) }
  }
  if (mirror) { const mx1 = VW - x2, mx2 = VW - x1; x1 = Math.min(x1, mx1); x2 = Math.max(x2, mx2) }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

// ---- Button-driven move / resize (precise, touch-friendly) ----------------
const MIN = 2
const MIN_FINGER = 6 // a finger's three phalanges never shrink below this total

/** Move the whole region by (dx, dy). Mutates spec in place. */
function nudgeSpec(spec: RegionSpec | FingerSpec | ToeSpec, dx: number, dy: number): void {
  if ('lens' in spec) { spec.rootX = r1(spec.rootX + dx); spec.rootY = r1(spec.rootY + dy); return }
  if ('cx' in spec && 'len' in spec) { spec.cx = r1(spec.cx + dx); spec.yTop = r1(spec.yTop + dy); return }
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box') { s.x1 = r1(s.x1 + dx); s.x2 = r1(s.x2 + dx); s.y1 = r1(s.y1 + dy); s.y2 = r1(s.y2 + dy) }
  else if (s.kind === 'ellipse') { s.cx = r1(s.cx + dx); s.cy = r1(s.cy + dy) }
  else { s.cxTop = r1(s.cxTop + dx); s.cxBot = r1(s.cxBot + dx); s.yTop = r1(s.yTop + dy); s.yBot = r1(s.yBot + dy) }
}

/** Grow/shrink about the centre: dw = width change, dh = height/length change. */
function resizeSpec(spec: RegionSpec | FingerSpec | ToeSpec, dw: number, dh: number): void {
  if ('lens' in spec) { // finger: dw = thickness, dh = length (scale the phalanges)
    spec.w = r1(Math.max(MIN, spec.w + dw))
    if (dh !== 0) { // only rescale phalanges on a length change (Thick taps leave it alone)
      const sum = spec.lens[0] + spec.lens[1] + spec.lens[2]
      const target = Math.max(MIN_FINGER, sum + dh) // never collapse below a usable length
      spec.lens = sum <= 0.3
        ? [r1(target / 3), r1(target / 3), r1(target / 3)] // recover a degenerate finger
        : [r1(spec.lens[0] * target / sum), r1(spec.lens[1] * target / sum), r1(spec.lens[2] * target / sum)] as [number, number, number]
    }
    return
  }
  if ('cx' in spec && 'len' in spec) {
    spec.w = r1(Math.max(MIN, spec.w + dw))
    spec.yTop = r1(spec.yTop - dh / 2)
    spec.len = r1(spec.len + dh)
    if (spec.len < MIN) { const c = spec.yTop + spec.len / 2; spec.len = MIN; spec.yTop = r1(c - MIN / 2) }
    return
  }
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box') {
    s.x1 = r1(s.x1 - dw / 2); s.x2 = r1(s.x2 + dw / 2); s.y1 = r1(s.y1 - dh / 2); s.y2 = r1(s.y2 + dh / 2)
    if (s.x2 - s.x1 < MIN) { const c = (s.x1 + s.x2) / 2; s.x1 = r1(c - MIN / 2); s.x2 = r1(c + MIN / 2) }
    if (s.y2 - s.y1 < MIN) { const c = (s.y1 + s.y2) / 2; s.y1 = r1(c - MIN / 2); s.y2 = r1(c + MIN / 2) }
  } else if (s.kind === 'ellipse') {
    s.rx = r1(Math.max(MIN, s.rx + dw / 2)); s.ry = r1(Math.max(MIN, s.ry + dh / 2))
  } else {
    s.wTop = r1(Math.max(MIN, s.wTop + dw)); s.wBot = r1(Math.max(MIN, s.wBot + dw))
    s.yTop = r1(s.yTop - dh / 2); s.yBot = r1(s.yBot + dh / 2)
    if (s.yBot - s.yTop < MIN) { const c = (s.yTop + s.yBot) / 2; s.yTop = r1(c - MIN / 2); s.yBot = r1(c + MIN / 2) }
  }
}

// ---- Component -------------------------------------------------------------
// Shape-guard the persisted edits: only accept a well-formed BodyRegionData, so
// a stale/garbage localStorage value can never reach buildRegions and throw.
function isRegionData(d: unknown): d is BodyRegionData {
  const o = d as BodyRegionData | null
  return !!o && typeof o === 'object'
    && !!o.head && Array.isArray(o.head.anterior) && Array.isArray(o.head.posterior)
    && Array.isArray(o.central) && Array.isArray(o.left)
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
  const [zoom, setZoom] = useState<'region' | 'body'>('region')
  const [step, setStep] = useState(1)        // nudge/resize amount per button tap
  const [recenter, setRecenter] = useState(0) // bump to re-frame the viewport
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

  // Apply a move/resize op from the button panel to the selected spec.
  function edit(fn: (spec: RegionSpec | FingerSpec | ToeSpec) => void) {
    if (!sel) return
    setData((d) => { const nd = clone(d); fn(specShape(nd, sel)); return nd })
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
  // Frame the viewport to the selected region (with padding) so its handles are
  // big and easy to grab. Crucially this is computed ONLY when the selection /
  // zoom / view changes (or Recenter), NOT on every edit — so the figure holds
  // still while you drag or nudge the region instead of sliding under you.
  const selKey = sel ? JSON.stringify(sel) : 'none'
  const framedVb = useMemo(() => {
    if (zoom === 'region' && selSpec) {
      const mirror = sel?.k === 'head' && (selSpec as RegionSpec).side === 'left'
      const b = specBBox(selSpec, mirror)
      const P = Math.max(26, Math.max(b.w, b.h) * 0.7)
      const x = Math.max(0, b.x - P), y = Math.max(0, b.y - P)
      return { x, y, w: Math.min(VW, b.x + b.w + P) - x, h: Math.min(VH, b.y + b.h + P) - y }
    }
    return { x: 0, y: 0, w: VW, h: VH }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, zoom, view, recenter])
  // Snapshot the frame at pointer-down and hold it for the WHOLE drag, so even a
  // mid-drag zoom/view/recenter change can't shift the SVG transform under the
  // pointer. (Button nudges don't change the frame deps, so they stay steady too.)
  const frozenVb = useRef(framedVb)
  const vb = drag ? frozenVb.current : framedVb
  const hsz = Math.max(1.6, vb.w * 0.018) // ~constant on-screen handle size

  return (
    <div className="calib">
      <div className="calib-bar">
        <strong>Region calibrator</strong>
        <button type="button" onClick={toggleView}>View: {view}</button>
        <button type="button" onClick={() => setZoom((z) => (z === 'region' ? 'body' : 'region'))}>
          Zoom: {zoom === 'region' ? 'region' : 'whole body'}
        </button>
        <select value={sel ? specs.findIndex((s) => addrEq(s.addr, sel)) : -1}
          onChange={(e) => { const i = Number(e.target.value); setSel(i >= 0 ? specs[i].addr : null); if (i >= 0) setZoom('region') }}>
          <option value={-1}>— pick a region —</option>
          {specs.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
        </select>
        <button type="button" onClick={save}>Save</button>
        <button type="button" onClick={exportJson}>Export JSON</button>
        <button type="button" onClick={reset}>Reset to built-in</button>
        {savedAt && <span className="calib-note">saved {savedAt} — resumes here; Export &amp; commit to make it the app default</span>}
      </div>
      <div className="calib-hint">
        Pick a region — the view zooms to it (toggle <em>Zoom</em> for the whole body). Drag the
        <span style={{ color: '#3b82f6', fontWeight: 700 }}> blue ring</span> to move the whole region,
        the <span style={{ color: '#f59e0b', fontWeight: 700 }}>amber dots</span> to reshape it — or use the
        <strong> Move / Width / Height</strong> buttons below for precise taps (the figure stays put while you
        adjust). Edit the image-LEFT / centre / head regions; the right side mirrors automatically.
        Selected: <strong>{sel ? specs.find((s) => addrEq(s.addr, sel))?.label : 'none'}</strong>.
      </div>
      {sel && selSpec && (
        <div className="calib-nudge">
          <span className="cn-lbl">Move</span>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, -step, 0))} aria-label="move left">←</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, 0, -step))} aria-label="move up">↑</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, 0, step))} aria-label="move down">↓</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, step, 0))} aria-label="move right">→</button>
          <span className="cn-lbl">{'lens' in selSpec ? 'Thick' : 'Width'}</span>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, -step, 0))} aria-label="narrower">−</button>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, step, 0))} aria-label="wider">+</button>
          <span className="cn-lbl">{'lens' in selSpec ? 'Length' : 'Height'}</span>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, 0, -step))} aria-label="shorter">−</button>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, 0, step))} aria-label="taller">+</button>
          {'lens' in selSpec && (<>
            <span className="cn-lbl">Rotate</span>
            <button type="button" onClick={() => edit((s) => { (s as FingerSpec).ang = r1((s as FingerSpec).ang - step) })} aria-label="rotate left">↺</button>
            <button type="button" onClick={() => edit((s) => { (s as FingerSpec).ang = r1((s as FingerSpec).ang + step) })} aria-label="rotate right">↻</button>
          </>)}
          <span className="cn-sep" />
          <span className="cn-lbl">Step</span>
          <button type="button" className={step === 1 ? 'on' : ''} onClick={() => setStep(1)}>1</button>
          <button type="button" className={step === 5 ? 'on' : ''} onClick={() => setStep(5)}>5</button>
          <button type="button" onClick={() => setRecenter((r) => r + 1)}>Recenter</button>
        </div>
      )}
      <svg
        ref={svgRef}
        className="calib-svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
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
            cx={h.x} cy={h.y} r={h.role === 'move' ? hsz * 1.4 : hsz}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); frozenVb.current = framedVb; setDrag({ id: h.id, prev: { ...h } }) }}
          />
        ))}
      </svg>
    </div>
  )
}
