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
  type BodyView, type BodyRegionData, type RegionSpec, type FingerSpec, type ToeSpec, type ShapeSpec, type RegionGroup,
  BODY_REGION_DATA, BODY_VIEWBOX, buildRegions, applyRegionData,
} from '@triage-link/core'
import { FIGURE_IMAGE } from './figure'
import { useLang, regionLabel, type TFn } from '../i18n'

const { width: VW, height: VH } = BODY_VIEWBOX
const LS_KEY = 'tl.regions.override'
const r1 = (n: number) => Math.round(n * 10) / 10
const clone = (d: BodyRegionData): BodyRegionData => JSON.parse(JSON.stringify(d))

/** Rotate (x,y) by `deg` (clockwise) about (cx,cy). Used to keep handles on a
 *  tilted box/ellipse and to inverse-map drags back into the shape's local frame. */
function rotPt(x: number, y: number, cx: number, cy: number, deg = 0): { x: number; y: number } {
  if (!deg) return { x, y }
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
}
/** Centre + rotation of a box/ellipse shape (for handle rotation). */
function shapeRot(s: { kind: string } & Record<string, number | undefined>): { cx: number; cy: number; rot: number } {
  if (s.kind === 'box') return { cx: ((s.x1 as number) + (s.x2 as number)) / 2, cy: ((s.y1 as number) + (s.y2 as number)) / 2, rot: s.rot ?? 0 }
  return { cx: s.cx as number, cy: s.cy as number, rot: s.rot ?? 0 } // ellipse
}

// ---- Editable address into the data ---------------------------------------
type Addr =
  | { k: 'head'; view: BodyView; i: number }
  | { k: 'central'; i: number }
  | { k: 'left'; i: number }
  | { k: 'finger'; i: number; fi: number }
  | { k: 'toe'; i: number; ti: number }

const addrEq = (a: Addr, b: Addr | null): boolean => !!b && JSON.stringify(a) === JSON.stringify(b)

interface Listed { addr: Addr; label: string }

// Every editable spec for the current view, in a friendly order. Labels are
// localized: the bucket prefix via t(), the anatomical name via regionLabel().
function listSpecs(data: BodyRegionData, view: BodyView, t: TFn, lang: string): Listed[] {
  const out: Listed[] = []
  const rl = (n: string) => regionLabel(n, lang)
  // Shared parts are labelled for the CURRENT view: the anterior name on the
  // front, the posterior name on the back (Pelvis↔Buttock, Upper abdomen↔Mid
  // back, …) so the picker matches what the figure shows. Head parts are already
  // per-view lists; the bkLeft bucket denotes the mirrored left+right pair.
  const viewName = (r: RegionSpec) => (view === 'anterior' ? r.names!.ant : r.names!.post)
  data.head[view].forEach((s, i) => out.push({ addr: { k: 'head', view, i }, label: `${t('calib.bkHead')} · ${rl(s.name!)}` }))
  data.central.forEach((s, i) => out.push({ addr: { k: 'central', i }, label: `${t('calib.bkCentre')} · ${rl(viewName(s))}` }))
  data.left.forEach((e, i) => {
    if ('fingers' in e) e.fingers.forEach((f, fi) => out.push({ addr: { k: 'finger', i, fi }, label: `${t('calib.bkHand')} · ${t('calib.finger', { label: rl(f.label) })}` }))
    // Toes are anterior-only (their tops aren't visible on the back view), so they
    // aren't listed — nor hit-tested — on the posterior view.
    else if ('toes' in e) { if (view === 'anterior') e.toes.forEach((to, ti) => out.push({ addr: { k: 'toe', i, ti }, label: `${t('calib.bkFoot')} · ${rl(to.label)}` })) }
    else out.push({ addr: { k: 'left', i }, label: `${t('calib.bkLeft')} · ${rl(viewName(e as RegionSpec))}` })
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

// ---- Region add / duplicate / split / delete ------------------------------
// These operate on whole RegionSpecs (not fingers/toes), so the calibrator can
// build new regions and break one region into several — e.g. split the nose
// into a triangular tip + a rectangular bridge.
const GROUPS: ReadonlyArray<RegionGroup> = ['head', 'face', 'neck', 'trunk', 'arm', 'hand', 'leg', 'foot']

/** The array + index holding the RegionSpec an address points at (head / centre
 *  / left). Returns null for finger/toe groups, which aren't single regions. */
function regionArr(data: BodyRegionData, addr: Addr): { arr: Array<RegionSpec>; i: number } | null {
  if (addr.k === 'head') return { arr: data.head[addr.view], i: addr.i }
  if (addr.k === 'central') return { arr: data.central, i: addr.i }
  if (addr.k === 'left') { const e = data.left[addr.i]; return 'shape' in e ? { arr: data.left as RegionSpec[], i: addr.i } : null }
  return null
}
/** True when an address points at an editable single region (not a finger/toe). */
const isRegionAddr = (addr: Addr | null): boolean => !!addr && (addr.k === 'head' || addr.k === 'central' || (addr.k === 'left'))
/** Bump a region address to the next index (after inserting a copy below it). */
const nextAddr = (a: Addr): Addr => (a.k === 'head' || a.k === 'central' || a.k === 'left') ? { ...a, i: a.i + 1 } : a
/** Append a suffix to whichever name field(s) a region carries. */
function suffixName(r: RegionSpec, suf: string): void {
  if (r.name != null) r.name = r.name + suf
  if (r.names) r.names = { ant: r.names.ant + suf, post: r.names.post + suf }
}

// ---- Handles ---------------------------------------------------------------
// role: 'move' = drag the whole region · 'pt' = reshape · 'add' = insert a
// polygon vertex (small green +).
interface Handle { id: string; x: number; y: number; role: 'move' | 'pt' | 'add' }

const polyCentroid = (pts: ReadonlyArray<[number, number]>): [number, number] =>
  [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]

const bboxOfPts = (pts: ReadonlyArray<[number, number]>): { x1: number; y1: number; x2: number; y2: number } => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}

// Trace any shape's outline as a list of vertices (rotation applied), so a shape
// can be converted to another kind while keeping the same footprint, and so a
// box/ellipse/quad can be turned into an editable free polygon.
function outlinePoints(s: ShapeSpec): Array<[number, number]> {
  if (s.kind === 'box') {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rot = s.rot ?? 0
    return ([[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]] as Array<[number, number]>)
      .map(([x, y]) => { const p = rotPt(x, y, cx, cy, rot); return [p.x, p.y] })
  }
  if (s.kind === 'ellipse') {
    const rot = s.rot ?? 0, out: Array<[number, number]> = []
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI; const p = rotPt(s.cx + s.rx * Math.cos(a), s.cy + s.ry * Math.sin(a), s.cx, s.cy, rot); out.push([p.x, p.y]) }
    return out
  }
  if (s.kind === 'polygon') return s.pts.map(([x, y]) => [x, y])
  return [[s.cxTop - s.wTop / 2, s.yTop], [s.cxTop + s.wTop / 2, s.yTop], [s.cxBot + s.wBot / 2, s.yBot], [s.cxBot - s.wBot / 2, s.yBot]]
}

// The shape kinds the calibrator can switch a region between. 'ellipse' splits
// into Circle (rx==ry) vs Oval; Triangle / Half-circle / free Polygon are all
// stored as { kind:'polygon' } so they hit-test and mirror like any polygon.
type ShapeKind = 'box' | 'circle' | 'oval' | 'triangle' | 'halfcircle' | 'polygon'
const SHAPE_KINDS: ReadonlyArray<readonly [ShapeKind, string]> = [
  ['box', 'Rectangle'], ['circle', 'Circle'], ['oval', 'Oval'],
  ['triangle', 'Triangle'], ['halfcircle', 'Half-circle'], ['polygon', 'Polygon'],
]

/** Best-effort label of the current shape, to show in the Shape menu. */
function shapeKindOf(s: ShapeSpec): ShapeKind {
  if (s.kind === 'box') return 'box'
  if (s.kind === 'ellipse') return Math.abs(s.rx - s.ry) < 0.5 ? 'circle' : 'oval'
  if (s.kind === 'quad') return 'box'
  return 'polygon'
}

/** Convert a shape to another kind, preserving its bounding footprint. */
function convertShape(s: ShapeSpec, kind: ShapeKind): ShapeSpec {
  const pts = outlinePoints(s)
  const { x1, y1, x2, y2 } = bboxOfPts(pts)
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, w = Math.max(MIN, x2 - x1), h = Math.max(MIN, y2 - y1)
  switch (kind) {
    case 'box': return { kind: 'box', x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) }
    case 'circle': { const r = Math.max(MIN, Math.min(w, h) / 2); return { kind: 'ellipse', cx: r1(cx), cy: r1(cy), rx: r1(r), ry: r1(r) } }
    case 'oval': return { kind: 'ellipse', cx: r1(cx), cy: r1(cy), rx: r1(w / 2), ry: r1(h / 2) }
    case 'triangle': return { kind: 'polygon', pts: [[r1(cx), r1(y1)], [r1(x2), r1(y2)], [r1(x1), r1(y2)]] }
    case 'halfcircle': {
      const out: Array<[number, number]> = [[r1(x1), r1(y1)], [r1(x2), r1(y1)]]
      const N = 10
      for (let i = 0; i <= N; i++) { const a = Math.PI * (i / N); out.push([r1(cx + (w / 2) * Math.cos(a)), r1(y1 + h * Math.sin(a))]) }
      return { kind: 'polygon', pts: out }
    }
    case 'polygon': return { kind: 'polygon', pts: pts.map(([x, y]) => [r1(x), r1(y)] as [number, number]) }
  }
}

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
  if (s.kind === 'box') {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rot = s.rot ?? 0
    const P = (id: string, x: number, y: number): Handle => { const p = rotPt(x, y, cx, cy, rot); return { id, x: r1(p.x), y: r1(p.y), role: 'pt' } }
    return [
      { id: 'c', x: r1(cx), y: r1(cy), role: 'move' },
      P('nw', s.x1, s.y1), P('ne', s.x2, s.y1), P('se', s.x2, s.y2), P('sw', s.x1, s.y2),
      P('n', cx, s.y1), P('s', cx, s.y2), P('w', s.x1, cy), P('e', s.x2, cy), // edge midpoints (8-anchor)
    ]
  }
  if (s.kind === 'polygon') {
    const pts = s.pts, b = bboxOfPts(pts) // move ring at the bbox CENTRE (visual middle), not the vertex average
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2
    const out: Handle[] = [{ id: 'c', x: r1(cx), y: r1(cy), role: 'move' }]
    pts.forEach((p, i) => out.push({ id: `v${i}`, x: r1(p[0]), y: r1(p[1]), role: 'pt' }))
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; out.push({ id: `add${i}`, x: r1((p[0] + q[0]) / 2), y: r1((p[1] + q[1]) / 2), role: 'add' }) })
    return out
  }
  if (s.kind === 'ellipse') {
    const rot = s.rot ?? 0
    const P = (id: string, x: number, y: number): Handle => { const p = rotPt(x, y, s.cx, s.cy, rot); return { id, x: r1(p.x), y: r1(p.y), role: 'pt' } }
    return [
      { id: 'c', x: s.cx, y: s.cy, role: 'move' },
      P('e', s.cx + s.rx, s.cy), P('s', s.cx, s.cy + s.ry),
    ]
  }
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
  // For a tilted box/ellipse, map the pointer back into the shape's local
  // (un-rotated) frame so the existing reshape maths apply. The centre/move
  // handle is rotation-invariant, so leave it in world space.
  if ((s.kind === 'box' || s.kind === 'ellipse') && (s.rot ?? 0) && id !== 'c') {
    const { cx, cy, rot } = shapeRot(s as never)
    const p = rotPt(px, py, cx, cy, -rot); px = p.x; py = p.y
  }
  if (s.kind === 'polygon') {
    if (id === 'c') { const dx = px - prev.x, dy = py - prev.y; s.pts = s.pts.map(([x, y]) => [r1(x + dx), r1(y + dy)]); return }
    if (id.startsWith('v')) { const i = +id.slice(1); if (s.pts[i]) s.pts[i] = [r1(px), r1(py)] } // 'add' handled at pointer-down
    return
  }
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
    if (s.kind === 'box') {
      if (s.rot) { // rotated rectangle: bound its four turned corners
        const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2
        const cs = ([[s.x1, s.y1], [s.x2, s.y1], [s.x2, s.y2], [s.x1, s.y2]] as const).map(([x, y]) => rotPt(x, y, cx, cy, s.rot))
        x1 = Math.min(...cs.map((p) => p.x)); x2 = Math.max(...cs.map((p) => p.x)); y1 = Math.min(...cs.map((p) => p.y)); y2 = Math.max(...cs.map((p) => p.y))
      } else { x1 = s.x1; y1 = s.y1; x2 = s.x2; y2 = s.y2 }
    } else if (s.kind === 'ellipse') {
      const a = (s.rot ?? 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a)
      const hw = Math.hypot(s.rx * c, s.ry * sn), hh = Math.hypot(s.rx * sn, s.ry * c) // rotated ellipse extent
      x1 = s.cx - hw; y1 = s.cy - hh; x2 = s.cx + hw; y2 = s.cy + hh
    } else if (s.kind === 'polygon') {
      const b = bboxOfPts(s.pts); x1 = b.x1; y1 = b.y1; x2 = b.x2; y2 = b.y2
    } else { const xs = [s.cxTop - s.wTop / 2, s.cxTop + s.wTop / 2, s.cxBot - s.wBot / 2, s.cxBot + s.wBot / 2]; x1 = Math.min(...xs); x2 = Math.max(...xs); y1 = Math.min(s.yTop, s.yBot); y2 = Math.max(s.yTop, s.yBot) }
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
  else if (s.kind === 'polygon') { s.pts = s.pts.map(([x, y]) => [r1(x + dx), r1(y + dy)]) }
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
  if ('cx' in spec && 'len' in spec) { spec.w = r1(Math.max(MIN, spec.w + dw)); spec.len = r1(Math.max(MIN, spec.len + dh)); return }
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box') {
    s.x1 = r1(s.x1 - dw / 2); s.x2 = r1(s.x2 + dw / 2); s.y1 = r1(s.y1 - dh / 2); s.y2 = r1(s.y2 + dh / 2)
    if (s.x2 - s.x1 < MIN) { const c = (s.x1 + s.x2) / 2; s.x1 = r1(c - MIN / 2); s.x2 = r1(c + MIN / 2) }
    if (s.y2 - s.y1 < MIN) { const c = (s.y1 + s.y2) / 2; s.y1 = r1(c - MIN / 2); s.y2 = r1(c + MIN / 2) }
  } else if (s.kind === 'ellipse') {
    s.rx = r1(Math.max(MIN, s.rx + dw / 2)); s.ry = r1(Math.max(MIN, s.ry + dh / 2))
  } else if (s.kind === 'polygon') {
    const [cx, cy] = polyCentroid(s.pts), b = bboxOfPts(s.pts)
    const w = b.x2 - b.x1, h = b.y2 - b.y1
    const sx = w > MIN ? Math.max(0.05, (w + dw) / w) : 1, sy = h > MIN ? Math.max(0.05, (h + dh) / h) : 1
    s.pts = s.pts.map(([x, y]) => [r1(cx + (x - cx) * sx), r1(cy + (y - cy) * sy)])
  } else {
    s.wTop = r1(Math.max(MIN, s.wTop + dw)); s.wBot = r1(Math.max(MIN, s.wBot + dw))
    s.yTop = r1(s.yTop - dh / 2); s.yBot = r1(s.yBot + dh / 2)
    if (s.yBot - s.yTop < MIN) { const c = (s.yTop + s.yBot) / 2; s.yTop = r1(c - MIN / 2); s.yBot = r1(c + MIN / 2) }
  }
}

/** Rotate by `d` degrees: fingers via their angle, boxes/ellipses via `rot`. */
function rotateSpec(spec: RegionSpec | FingerSpec | ToeSpec, d: number): void {
  if ('lens' in spec) { spec.ang = r1(spec.ang + d); return }
  if ('cx' in spec && 'len' in spec) return // toe: no rotation
  const s = (spec as RegionSpec).shape
  if (s.kind === 'box' || s.kind === 'ellipse') s.rot = r1(((s.rot ?? 0) + d) % 360)
  else if (s.kind === 'polygon') { // a polygon has no `rot`; rotate its vertices about the centroid
    const [cx, cy] = polyCentroid(s.pts)
    s.pts = s.pts.map(([x, y]) => { const p = rotPt(x, y, cx, cy, d); return [r1(p.x), r1(p.y)] })
  }
}
/** Whether the selected spec can be rotated (fingers, boxes, ellipses, polygons). */
function rotatable(spec: RegionSpec | FingerSpec | ToeSpec): boolean {
  if ('lens' in spec) return true
  if ('cx' in spec && 'len' in spec) return false
  const k = (spec as RegionSpec).shape.kind
  return k === 'box' || k === 'ellipse' || k === 'polygon'
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

// Identity keys for every region in a map (bucket-prefixed anterior name / digit
// label), used to tell whether a saved map predates the shipped built-in.
function regionKeys(d: BodyRegionData): Set<string> {
  const s = new Set<string>()
  d.head.anterior.forEach((r) => s.add(`ha:${r.name}`))
  d.head.posterior.forEach((r) => s.add(`hp:${r.name}`))
  d.central.forEach((r) => s.add(`c:${r.names!.ant}`))
  d.left.forEach((e) => {
    if ('fingers' in e) e.fingers.forEach((f) => s.add(`f:${f.label}`))
    else if ('toes' in e) e.toes.forEach((tt) => s.add(`t:${tt.label}`))
    else s.add(`l:${(e as RegionSpec).names!.ant}`)
  })
  return s
}

// Built-in regions absent from `saved` — i.e. added since the map was saved.
// Their (anterior) display names drive the "your saved map is out of date"
// prompt so the user can pull the current built-in (e.g. a newly-added Groin).
function regionsAddedSince(saved: BodyRegionData): string[] {
  const have = regionKeys(saved), out: string[] = []
  const bd = BODY_REGION_DATA
  bd.head.anterior.forEach((r) => { if (!have.has(`ha:${r.name}`)) out.push(r.name!) })
  bd.head.posterior.forEach((r) => { if (!have.has(`hp:${r.name}`)) out.push(r.name!) })
  bd.central.forEach((r) => { if (!have.has(`c:${r.names!.ant}`)) out.push(r.names!.ant) })
  bd.left.forEach((e) => {
    if ('fingers' in e) e.fingers.forEach((f) => { if (!have.has(`f:${f.label}`)) out.push(f.label) })
    else if ('toes' in e) e.toes.forEach((tt) => { if (!have.has(`t:${tt.label}`)) out.push(tt.label) })
    else { const r = e as RegionSpec; if (!have.has(`l:${r.names!.ant}`)) out.push(r.names!.ant) }
  })
  return out
}

export function RegionCalibrator({ onClose }: { onClose?: () => void } = {}) {
  const { t, lang } = useLang()
  const [view, setView] = useState<BodyView>('anterior')
  const [data, setData] = useState<BodyRegionData>(() => loadSaved() ?? clone(BODY_REGION_DATA))
  const [sel, setSel] = useState<Addr | null>(null)
  const [selVert, setSelVert] = useState<number | null>(null) // last-touched polygon vertex (for "− point")
  const [drag, setDrag] = useState<{ id: string; prev: Handle } | null>(null)
  const [savedAt, setSavedAt] = useState<string>('')
  const [zoom, setZoom] = useState<'region' | 'body'>('region')
  const [step, setStep] = useState(1)        // nudge/resize amount per button tap
  const [recenter, setRecenter] = useState(0) // bump to re-frame the viewport
  const [showHelp, setShowHelp] = useState(false) // in-app help / cheat-sheet overlay
  const [staleDismissed, setStaleDismissed] = useState(false)
  const [importErr, setImportErr] = useState('') // shown when an imported file is not a valid map
  // Undo stack in a ref (always current, so rapid Ctrl+Z key-repeat pops exactly
  // one entry per press); a length state drives the disabled button. Each entry
  // also snapshots the saved-override slot, so undoing a Reset (which clears it)
  // restores localStorage too — not just the in-memory map.
  const historyRef = useRef<Array<{ data: BodyRegionData; saved: string | null }>>([])
  const [histLen, setHistLen] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importTokenRef = useRef(0) // invalidates an in-flight async Import (see importFile)
  // Mirror of `data` that is always current — so history snapshots taken after an
  // await (e.g. async Import reading a file) capture the LATEST map, not the
  // stale value captured in the closure when the action started.
  const dataRef = useRef(data)

  // Snapshot the current map + saved slot BEFORE a discrete edit (a button tap or
  // the start of a drag — not every pointermove). Capped so it can't grow forever.
  const pushHistory = () => {
    let saved: string | null = null
    try { saved = localStorage.getItem(LS_KEY) } catch { /* ignore */ }
    historyRef.current = [...historyRef.current, { data: clone(dataRef.current), saved }].slice(-60)
    setHistLen(historyRef.current.length)
  }
  function undo() {
    const h = historyRef.current
    if (!h.length) return
    const prev = h[h.length - 1]
    historyRef.current = h.slice(0, -1)
    setHistLen(historyRef.current.length)
    setDrag(null) // end any in-progress drag so later pointer moves don't re-edit the restored map
    try { if (prev.saved === null) localStorage.removeItem(LS_KEY); else localStorage.setItem(LS_KEY, prev.saved) } catch { /* ignore */ }
    setData(prev.data)
  }

  // Preview edits live WHILE the tool is mounted; restore the shipped default on
  // exit so the override never leaks into the normal app.
  useEffect(() => { dataRef.current = data; applyRegionData(data) }, [data])
  useEffect(() => () => { importTokenRef.current++; applyRegionData(null) }, [])

  // Ctrl/⌘+Z → undo one step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const regions = useMemo(() => buildRegions(data, view), [data, view])
  const specs = useMemo(() => listSpecs(data, view, t, lang), [data, view, t, lang])
  // Built-in regions the CURRENT map lacks. Reactive to `data`, so it clears the
  // moment the map becomes current (Reset / Load latest) and re-appears if an
  // Undo restores a stale map — never keyed to a one-time mount snapshot.
  const staleNow = useMemo(() => regionsAddedSince(data), [data])
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
    pushHistory()
    setData((d) => { const nd = clone(d); fn(specShape(nd, sel)); return nd })
  }

  // Head specs are view-specific (their index means a different region per
  // view), so a head selection must be dropped when the view changes — otherwise
  // its handles/drags would edit the OTHER view's head spec. Toes are shown only
  // on the anterior view, so a toe selection is dropped when leaving it. Other
  // shared regions (centre/left/finger) are view-independent and stay selected.
  function toggleView() {
    const next = view === 'anterior' ? 'posterior' : 'anterior'
    setView(next)
    setSel((s) => (s && (s.k === 'head' || (s.k === 'toe' && next === 'posterior')) ? null : s))
    setSelVert(null)
  }

  // Switch the selected region's shape (Rectangle / Circle / Oval / Triangle /
  // Half-circle / free Polygon), keeping its footprint. Fingers/toes have no
  // ShapeSpec, so the menu is hidden for them.
  function convertSel(kind: ShapeKind) {
    if (!sel) return
    pushHistory()
    setSelVert(null)
    setData((d) => { const nd = clone(d); const sp = specShape(nd, sel); if ('shape' in sp) sp.shape = convertShape(sp.shape, kind); return nd })
  }

  // Remove the last-touched vertex of a polygon (kept at ≥3 so it stays a face).
  function removeVert() {
    if (!sel || selVert == null) return
    pushHistory()
    setData((d) => {
      const nd = clone(d); const sp = specShape(nd, sel)
      if ('shape' in sp && sp.shape.kind === 'polygon' && sp.shape.pts.length > 3) sp.shape.pts.splice(selVert, 1)
      return nd
    })
    setSelVert(null)
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); setSavedAt(new Date().toLocaleTimeString()); setImportErr('') } catch { /* ignore */ }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = 'body-regions.data.json'; a.click(); URL.revokeObjectURL(url)
  }
  // Load a previously exported map back into the tool (the inverse of Export).
  // Validated before applying so a wrong/garbage file can't corrupt the editor;
  // snapshots history first so Import is undoable. Editing-only — like every
  // other edit here it only changes the live map WHILE the tool is mounted.
  async function importFile(file: File) {
    // Generation token: bump on start so a second Import supersedes the first,
    // and any other action that invalidates an in-flight read (Reset, unmount)
    // bumps it too. After the await we bail unless we're still the current read,
    // so a slow file load can't clobber a map the user has since chosen.
    const token = ++importTokenRef.current
    try {
      const parsed = JSON.parse(await file.text())
      if (token !== importTokenRef.current) return
      // Structural check, then a full trial build for BOTH views: this exercises
      // every region/finger/toe shape via shapePoints, so a file that passes the
      // shallow array check but has a malformed/empty shape is rejected here
      // rather than crashing the editor after setData.
      if (!isRegionData(parsed)) { setImportErr(t('calib.importBad')); return }
      // A trial build runs shapePoints for every region; also require that each
      // built region yielded a real polygon — an unknown shape.kind produces
      // undefined points (later crashes rg.points.map) and an empty polygon
      // silently drops hit-testing. Both are rejected here.
      const built = [...buildRegions(parsed as BodyRegionData, 'anterior'),
                     ...buildRegions(parsed as BodyRegionData, 'posterior')]
      if (!built.every((r) => Array.isArray(r.points) && r.points.length >= 3)) {
        setImportErr(t('calib.importBad')); return
      }
      pushHistory() // snapshots the LATEST map (via dataRef), even after the await
      // Import is an unsaved edit: clear the "saved … resumes here" note so it
      // can't keep advertising an earlier Save that no longer matches the map.
      setData(parsed as BodyRegionData); setSel(null); setSelVert(null); setSavedAt(''); setImportErr('')
    } catch { if (token === importTokenRef.current) setImportErr(t('calib.importBad')) }
  }
  function reset() {
    importTokenRef.current++ // cancel any in-flight import so it can't clobber this
    pushHistory() // snapshot data + saved BEFORE clearing, so undo restores both
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    setData(clone(BODY_REGION_DATA)); setSel(null); setSavedAt(''); setImportErr('')
  }

  // ---- Region add / duplicate / split / delete ----------------------------
  // Add a fresh region (a small box at the view centre) to the current view's
  // list; select it so it can be named, grouped and reshaped right away.
  function addRegion() {
    pushHistory()
    const idx = data.head[view].length // appended → lands at the current length
    const cx = VW / 2, cy = VH / 2
    setData((d) => {
      const nd = clone(d)
      nd.head[view].push({ name: 'New region', group: 'trunk', tbsa: 0, shape: { kind: 'box', x1: r1(cx - 30), y1: r1(cy - 22), x2: r1(cx + 30), y2: r1(cy + 22) } })
      return nd
    })
    setSel({ k: 'head', view, i: idx }); setSelVert(null); setZoom('region')
  }

  // Duplicate the selected region just below it (offset a little) and select the copy.
  function duplicateRegion() {
    if (!isRegionAddr(sel)) return
    pushHistory()
    setData((d) => {
      const nd = clone(d); const ctx = regionArr(nd, sel!); if (!ctx) return nd
      const copy = JSON.parse(JSON.stringify(ctx.arr[ctx.i])) as RegionSpec
      nudgeSpec(copy, 12, 12); suffixName(copy, ' copy')
      ctx.arr.splice(ctx.i + 1, 0, copy)
      return nd
    })
    setSel((s) => (s ? nextAddr(s) : s)); setSelVert(null)
  }

  // Split the selected region into two halves (top/bottom if it's taller, else
  // left/right), in place — the seed for tracing two distinct shapes from one.
  function splitRegion() {
    if (!isRegionAddr(sel)) return
    pushHistory()
    setData((d) => {
      const nd = clone(d); const ctx = regionArr(nd, sel!); if (!ctx) return nd
      const orig = ctx.arr[ctx.i]
      const b = bboxOfPts(outlinePoints(orig.shape)), w = b.x2 - b.x1, h = b.y2 - b.y1
      const mk = (x1: number, y1: number, x2: number, y2: number, suf: string): RegionSpec => {
        const r = JSON.parse(JSON.stringify(orig)) as RegionSpec
        r.shape = { kind: 'box', x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) }; suffixName(r, suf); return r
      }
      const [a, c] = h >= w
        ? [mk(b.x1, b.y1, b.x2, (b.y1 + b.y2) / 2, ' 1'), mk(b.x1, (b.y1 + b.y2) / 2, b.x2, b.y2, ' 2')]
        : [mk(b.x1, b.y1, (b.x1 + b.x2) / 2, b.y2, ' 1'), mk((b.x1 + b.x2) / 2, b.y1, b.x2, b.y2, ' 2')]
      ctx.arr.splice(ctx.i, 1, a, c)
      return nd
    })
    setSelVert(null) // selection stays on the first half (same index)
  }

  // Delete the selected region (with a guard — it changes the shipped map until Reset).
  function deleteRegion() {
    if (!isRegionAddr(sel)) return
    if (!window.confirm(t('calib.deleteConfirm'))) return
    pushHistory()
    setData((d) => { const nd = clone(d); const ctx = regionArr(nd, sel!); if (ctx) ctx.arr.splice(ctx.i, 1); return nd })
    setSel(null); setSelVert(null)
  }

  // Edit a non-geometry property (name / group / tbsa / mirror) of the selected region.
  function editProp(fn: (r: RegionSpec) => void) {
    if (!isRegionAddr(sel)) return
    pushHistory()
    setData((d) => { const nd = clone(d); const sp = specShape(nd, sel!); if ('shape' in sp) fn(sp as RegionSpec); return nd })
  }

  // ---- Overlap precedence (cross-group) -----------------------------------
  // regionAt() hit-tests regions sorted by `priority` (higher first), so a higher
  // value wins an overlapping tap — across groups too (a head region vs a limb).
  // Front/Back lift above / drop below every region in this view; ↑/↓ nudge by 1.
  function priorityRange(): { min: number; max: number } {
    let min = 0, max = 0
    const visit = (p?: number) => { const v = p ?? 0; if (v < min) min = v; if (v > max) max = v }
    data.head[view].forEach((r) => visit(r.priority))
    data.central.forEach((r) => visit(r.priority))
    data.left.forEach((e) => { if ('shape' in e) visit(e.priority) })
    return { min, max }
  }
  function bumpPriority(kind: 'front' | 'up' | 'down' | 'back') {
    if (!isRegionAddr(sel)) return
    const { min, max } = priorityRange()
    editProp((r) => {
      const cur = r.priority ?? 0
      const next = kind === 'front' ? max + 1 : kind === 'back' ? min - 1 : kind === 'up' ? cur + 1 : cur - 1
      if (next === 0) delete r.priority
      else r.priority = next
    })
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
      {staleNow.length > 0 && !staleDismissed && (
        <div className="calib-stale" role="alert">
          <span>{t('calib.stale', { names: staleNow.slice(0, 4).map((n) => regionLabel(n, lang)).join(', ') + (staleNow.length > 4 ? '…' : '') })}</span>
          {/* Load latest makes the map current (staleNow → []), which hides this on its own — no sticky flag. */}
          <button type="button" onClick={reset} title={t('calib.staleLoadTitle')}>{t('calib.staleLoad')}</button>
          <button type="button" onClick={() => setStaleDismissed(true)} title={t('calib.staleKeepTitle')}>{t('calib.staleKeep')}</button>
        </div>
      )}
      <div className="calib-bar">
        <strong>{t('calib.title')}</strong>
        <button type="button" className="calib-help-btn" onClick={() => setShowHelp(true)} title={t('calib.helpTitle')} aria-label={t('calib.helpAria')}>{t('calib.help')}</button>
        <button type="button" onClick={toggleView} title={t('calib.viewTitle')}>{t('calib.view', { v: t(view === 'anterior' ? 'calib.anterior' : 'calib.posterior') })}</button>
        <button type="button" onClick={() => setZoom((z) => (z === 'region' ? 'body' : 'region'))} title={t('calib.zoomTitle')}>
          {t('calib.zoom', { z: t(zoom === 'region' ? 'calib.zRegion' : 'calib.zBody') })}
        </button>
        <select title={t('calib.pickTitle')}
          value={sel ? specs.findIndex((s) => addrEq(s.addr, sel)) : -1}
          onChange={(e) => { const i = Number(e.target.value); setSel(i >= 0 ? specs[i].addr : null); setSelVert(null); if (i >= 0) setZoom('region') }}>
          <option value={-1}>{t('calib.pick')}</option>
          {specs.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
        </select>
        {selSpec && 'shape' in selSpec && (
          <select className="calib-shape" value="" title={t('calib.shapeTitle')}
            onChange={(e) => { if (e.target.value) convertSel(e.target.value as ShapeKind) }}>
            <option value="">{t('calib.shapeMenu', { k: t(`calib.shape.${shapeKindOf((selSpec as RegionSpec).shape)}`) })}</option>
            {SHAPE_KINDS.map(([k]) => <option key={k} value={k}>{t(`calib.shape.${k}`)}</option>)}
          </select>
        )}
        <button type="button" onClick={addRegion} title={t('calib.addTitle')}>{t('calib.addRegion')}</button>
        <button type="button" onClick={save} title={t('calib.saveTitle')}>{t('calib.save')}</button>
        <button type="button" onClick={exportJson} title={t('calib.exportTitle')}>{t('calib.export')}</button>
        <button type="button" onClick={() => fileRef.current?.click()} title={t('calib.importTitle')}>{t('calib.import')}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
        <button type="button" onClick={reset} title={t('calib.resetTitle')}>{t('calib.reset')}</button>
        {savedAt && <span className="calib-note">{t('calib.savedNote', { time: savedAt })}</span>}
        {importErr && <span className="calib-note calib-err">{importErr}</span>}
        {onClose && <button type="button" className="calib-close" onClick={onClose} title={t('calib.closeTitle')}>{t('calib.close')}</button>}
      </div>
      <div className="calib-hint">
        {t('calib.hint')}{' '}
        {t('calib.selected', { label: sel ? (specs.find((s) => addrEq(s.addr, sel))?.label ?? t('calib.none')) : t('calib.none') })}
      </div>
      {sel && selSpec && (
        <div className="calib-nudge">
          <span className="cn-lbl" title={t('calib.moveTitle')}>{t('calib.move')}</span>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, -step, 0))} aria-label={t('calib.moveLeft')} title={t('calib.moveLeft')}>←</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, 0, -step))} aria-label={t('calib.moveUp')} title={t('calib.moveUp')}>↑</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, 0, step))} aria-label={t('calib.moveDown')} title={t('calib.moveDown')}>↓</button>
          <button type="button" onClick={() => edit((s) => nudgeSpec(s, step, 0))} aria-label={t('calib.moveRight')} title={t('calib.moveRight')}>→</button>
          <span className="cn-lbl" title={'lens' in selSpec ? t('calib.thickTitle') : t('calib.widthTitle')}>{'lens' in selSpec ? t('calib.thick') : t('calib.width')}</span>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, -step, 0))} aria-label={t('calib.narrower')} title={t('calib.narrower')}>−</button>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, step, 0))} aria-label={t('calib.wider')} title={t('calib.wider')}>+</button>
          <span className="cn-lbl" title={'lens' in selSpec ? t('calib.lengthTitle') : t('calib.heightTitle')}>{'lens' in selSpec ? t('calib.length') : t('calib.height')}</span>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, 0, -step))} aria-label={t('calib.shorter')} title={t('calib.shorter')}>−</button>
          <button type="button" onClick={() => edit((s) => resizeSpec(s, 0, step))} aria-label={t('calib.taller')} title={t('calib.taller')}>+</button>
          {rotatable(selSpec) && (<>
            <span className="cn-lbl" title={t('calib.rotateTitle')}>{t('calib.rotate')}</span>
            <button type="button" onClick={() => edit((s) => rotateSpec(s, -step))} aria-label={t('calib.rotL')} title={t('calib.rotL')}>↺</button>
            <button type="button" onClick={() => edit((s) => rotateSpec(s, step))} aria-label={t('calib.rotR')} title={t('calib.rotR')}>↻</button>
          </>)}
          <span className="cn-sep" />
          <button type="button" className="cn-undo" onClick={undo} disabled={!histLen} title={t('calib.undoTitle')}>{t('calib.undo')}</button>
          {'shape' in selSpec && (selSpec as RegionSpec).shape.kind === 'polygon' && (<>
            <span className="cn-lbl">{t('calib.point')}</span>
            <button type="button" onClick={removeVert}
              disabled={selVert == null || (selSpec as RegionSpec & { shape: { kind: 'polygon'; pts: unknown[] } }).shape.pts.length <= 3}
              title={t('calib.removePointTitle')}>{t('calib.removePoint')}</button>
          </>)}
          <span className="cn-sep" />
          <span className="cn-lbl" title={t('calib.stepTitle')}>{t('calib.step')}</span>
          <button type="button" className={step === 1 ? 'on' : ''} onClick={() => setStep(1)} title={t('calib.step1Title')}>1</button>
          <button type="button" className={step === 5 ? 'on' : ''} onClick={() => setStep(5)} title={t('calib.step5Title')}>5</button>
          <button type="button" onClick={() => setRecenter((r) => r + 1)} title={t('calib.recenterTitle')}>{t('calib.recenter')}</button>
        </div>
      )}
      {sel && selSpec && 'shape' in selSpec && (
        <div className="calib-edit">
          <span className="cn-lbl">{t('calib.region')}</span>
          {(selSpec as RegionSpec).name != null ? (
            <input className="ce-name" value={(selSpec as RegionSpec).name}
              onChange={(e) => editProp((r) => { r.name = e.target.value })} placeholder={t('calib.namePh')} aria-label={t('calib.namePh')} />
          ) : (<>
            <input className="ce-name" value={(selSpec as RegionSpec).names!.ant}
              onChange={(e) => editProp((r) => { if (r.names) r.names.ant = e.target.value })} placeholder={t('calib.antNamePh')} aria-label={t('calib.antNamePh')} />
            <input className="ce-name" value={(selSpec as RegionSpec).names!.post}
              onChange={(e) => editProp((r) => { if (r.names) r.names.post = e.target.value })} placeholder={t('calib.postNamePh')} aria-label={t('calib.postNamePh')} />
          </>)}
          <span className="cn-lbl">{t('calib.group')}</span>
          <select value={(selSpec as RegionSpec).group} onChange={(e) => editProp((r) => { r.group = e.target.value as RegionGroup })} aria-label={t('calib.group')}>
            {GROUPS.map((g) => <option key={g} value={g}>{t(`calib.grp.${g}`)}</option>)}
          </select>
          <span className="cn-lbl">{t('calib.tbsa')}</span>
          <input className="ce-num" type="number" step={0.1} min={0} value={(selSpec as RegionSpec).tbsa}
            onChange={(e) => editProp((r) => { r.tbsa = Number(e.target.value) || 0 })} aria-label={t('calib.tbsa')} />
          <label className="ce-chk"><input type="checkbox" checked={(selSpec as RegionSpec).side === 'left'}
            onChange={(e) => editProp((r) => { if (e.target.checked) r.side = 'left'; else delete r.side })} /> {t('calib.mirror')}</label>
          <span className="cn-sep" />
          <button type="button" onClick={duplicateRegion} title={t('calib.duplicateTitle')}>{t('calib.duplicate')}</button>
          <button type="button" onClick={splitRegion} title={t('calib.splitTitle')}>{t('calib.split')}</button>
          <button type="button" className="ce-del" onClick={deleteRegion} title={t('calib.deleteTitle')}>{t('calib.delete')}</button>
          <span className="cn-sep" />
          <span className="cn-lbl" title={t('calib.priorityTitle')}>{t('calib.priority', { n: (selSpec as RegionSpec).priority ?? 0 })}</span>
          <button type="button" onClick={() => bumpPriority('front')} title={t('calib.frontTitle')}>{t('calib.front')}</button>
          <button type="button" onClick={() => bumpPriority('up')} aria-label={t('calib.raise')}>↑</button>
          <button type="button" onClick={() => bumpPriority('down')} aria-label={t('calib.lower')}>↓</button>
          <button type="button" onClick={() => bumpPriority('back')} title={t('calib.backTitle')}>{t('calib.back')}</button>
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
            cx={h.x} cy={h.y} r={h.role === 'move' ? hsz * 1.4 : h.role === 'add' ? hsz * 0.8 : hsz}
            onPointerDown={(e) => {
              e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId)
              pushHistory(); frozenVb.current = framedVb
              if (h.role === 'add' && sel) { // insert a new vertex after edge i, then drag it
                const i = +h.id.slice(3)
                setData((d) => { const nd = clone(d); const sp = specShape(nd, sel); if ('shape' in sp && sp.shape.kind === 'polygon') sp.shape.pts.splice(i + 1, 0, [h.x, h.y]); return nd })
                setSelVert(i + 1)
                setDrag({ id: `v${i + 1}`, prev: { id: `v${i + 1}`, x: h.x, y: h.y, role: 'pt' } })
                return
              }
              if (h.id.startsWith('v')) setSelVert(+h.id.slice(1))
              setDrag({ id: h.id, prev: { ...h } })
            }}
          />
        ))}
      </svg>
      {showHelp && <CalibHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ---- In-app help / cheat-sheet --------------------------------------------
// A contextual reference for every calibrator control, reachable from the ❓ Help
// button. Follows the app language like the rest of the calibrator UI.
function CalibHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  return (
    <div className="calib-help" role="dialog" aria-modal="true" aria-label={t('calib.h.title')} onClick={onClose}>
      <div className="calib-help-card" onClick={(e) => e.stopPropagation()}>
        <header className="calib-help-head">
          <h2>{t('calib.h.title')}</h2>
          <button type="button" onClick={onClose} title={t('calib.closeTitle')}>{t('calib.close')}</button>
        </header>
        <div className="calib-help-body">
          <p>{t('calib.h.intro')}</p>

          <h3>{t('calib.h.nav')}</h3>
          <ul>
            <li>{t('calib.h.nav1')}</li>
            <li>{t('calib.h.nav2')}</li>
            <li>{t('calib.h.nav3')}</li>
            <li>{t('calib.h.nav4')}</li>
          </ul>

          <h3>{t('calib.h.handles')}</h3>
          <ul>
            <li><span className="ch-blue">●</span> {t('calib.h.handles1')}</li>
            <li><span className="ch-amber">●</span> {t('calib.h.handles2')}</li>
            <li><span className="ch-green">＋</span> {t('calib.h.handles3')}</li>
          </ul>

          <h3>{t('calib.h.precise')}</h3>
          <ul><li>{t('calib.h.precise1')}</li></ul>

          <h3>{t('calib.h.shapes')}</h3>
          <ul><li>{t('calib.h.shapes1')}</li></ul>

          <h3>{t('calib.h.build')}</h3>
          <ul>
            <li>{t('calib.h.build1')}</li>
            <li>{t('calib.h.build2')}</li>
            <li>{t('calib.h.build3')}</li>
          </ul>

          <h3>{t('calib.h.overlap')}</h3>
          <ul><li>{t('calib.h.overlap1')}</li></ul>

          <h3>{t('calib.h.save')}</h3>
          <ul>
            <li>{t('calib.h.save1')}</li>
            <li>{t('calib.h.save2')}</li>
            <li>{t('calib.h.save3')}</li>
            <li>{t('calib.h.save5')}</li>
            <li>{t('calib.h.save6')}</li>
            <li>{t('calib.h.save4')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
