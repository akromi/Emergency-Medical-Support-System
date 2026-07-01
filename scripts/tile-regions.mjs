// Adopt an exported region map and AUTO-TILE it: expand every region outward by a
// small margin so the tight hand-traced polygons overlap at their seams (and the
// mirror midline), leaving no on-body gaps that fall through to the coarse
// vertical-band fallback. Also gives the foot its whole-foot coverage, since the
// toes are anterior-only (their tops aren't visible from behind).
//
//   node scripts/tile-regions.mjs <exported.json>
//
// It rewrites packages/core/src/domain/body-regions.data.ts IN PLACE (keeping the
// file's type/helper header). Do NOT redirect stdout into that file — the shell
// would truncate it before the script can read its header.
//
// Idempotent-ish: run once per adopted export. Margin is deliberately small
// (a few px) — enough to close seams, not enough to visibly distort a region.
import { readFileSync } from 'fs'

const MARGIN = 6
const SRC = process.argv[2]
const d = JSON.parse(readFileSync(SRC, 'utf8'))

const r1 = (n) => Math.round(n * 10) / 10
const signedArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1 } return a / 2 }
function offsetPolygon(pts, m) {
  const ccw = signedArea(pts) > 0, n = pts.length, out = []
  const nrm = (dx, dy) => (ccw ? [dy, -dx] : [-dy, dx]) // outward normal for the winding
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n]
    let e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]]
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1
    const n1 = nrm(e1[0] / l1, e1[1] / l1), n2 = nrm(e2[0] / l2, e2[1] / l2)
    let bx = n1[0] + n2[0], by = n1[1] + n2[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl
    let cos = bx * n1[0] + by * n1[1]; if (cos < 0.25) cos = 0.25 // miter limit
    const s = m / cos
    out.push([r1(c[0] + bx * s), r1(c[1] + by * s)])
  }
  return out
}
function dilateShape(sh, m) {
  if (sh.kind === 'box') return { ...sh, x1: r1(sh.x1 - m), y1: r1(sh.y1 - m), x2: r1(sh.x2 + m), y2: r1(sh.y2 + m) }
  if (sh.kind === 'ellipse') return { ...sh, rx: r1(sh.rx + m), ry: r1(sh.ry + m) }
  if (sh.kind === 'polygon') return { ...sh, pts: offsetPolygon(sh.pts, m) }
  if (sh.kind === 'quad') return { ...sh, wTop: sh.wTop + 2 * m, wBot: sh.wBot + 2 * m, yTop: sh.yTop - m, yBot: sh.yBot + m }
  return sh
}

// --- foot: cover the WHOLE foot (heel + toe footprint), toes are anterior-only ---
const toes = d.left.find((e) => 'toes' in e)?.toes ?? []
const foot = d.left.find((e) => e.names && e.names.ant === 'Foot dorsum')
if (foot && toes.length) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  const acc = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y) }
  if (foot.shape.kind === 'polygon') foot.shape.pts.forEach(([x, y]) => acc(x, y))
  else if (foot.shape.kind === 'box') { acc(foot.shape.x1, foot.shape.y1); acc(foot.shape.x2, foot.shape.y2) }
  // Accumulate each toe's four corners AFTER rotating about its root (cx, yTop),
  // so a splayed (ang != 0) toe still lands fully inside the whole-foot box.
  const rot = (x, y, cx, cy, deg) => { const a = ((deg || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c] }
  for (const t of toes) {
    for (const [px, py] of [[t.cx - t.w / 2, t.yTop], [t.cx + t.w / 2, t.yTop], [t.cx + t.w / 2, t.yTop + t.len], [t.cx - t.w / 2, t.yTop + t.len]]) {
      const [rx, ry] = rot(px, py, t.cx, t.yTop, t.ang); acc(rx, ry)
    }
  }
  foot.shape = { kind: 'box', x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) }
}

// --- close the few vertical junction gaps wider than the dilation margin ---
// (stable for this figure): neck must meet the chest, and the head-top regions
// must reach the crown of the skull.
const topY = (sh) => sh.kind === 'box' ? sh.y1 : sh.kind === 'polygon' ? Math.min(...sh.pts.map((p) => p[1])) : sh.kind === 'quad' ? sh.yTop : sh.kind === 'ellipse' ? sh.cy - sh.ry : Infinity
const neck = d.central.find((s) => s.names && s.names.ant === 'Anterior neck')
const chest = d.left.find((e) => e.names && e.names.ant === 'Chest')
// Extend the neck down to the chest's top, whatever shape the chest is traced as.
if (neck && neck.shape.kind === 'box' && chest && chest.shape) {
  neck.shape.y2 = Math.max(neck.shape.y2, topY(chest.shape) + 2)
}

// --- dilate every region shape (skip fingers/toes: distal, no seam gaps) ---
// --- dilate the large "background" regions to close seams, but NOT fine
// features (they'd steal precedence from neighbours), and grow the skull cap
// upward only (not sideways into the ears). ---
const FINE = new Set(['Eye', 'Ear', 'Nose', 'Mouth', 'Cheek', 'Chin', 'Forehead'])
const isFine = (s) => FINE.has(s.name) || (s.names && s.names.ant === 'Groin')
const isCap = (s) => s.name === 'Crown' || s.name === 'Posterior scalp'
const capUp = (pts) => pts.map(([x, y]) => [x, y < 122 ? Math.min(y, 104) : y]) // raise the dome to the skull top only
const tile = (s) => {
  if (!s.shape) return
  if (isFine(s)) return                                   // leave fine features exactly as traced
  if (isCap(s) && s.shape.kind === 'polygon') { s.shape.pts = capUp(s.shape.pts); return }
  s.shape = dilateShape(s.shape, MARGIN)
}
d.head.anterior.forEach(tile); d.head.posterior.forEach(tile); d.central.forEach(tile)
d.left.forEach((e) => tile(e))

// --- emit TS (same shape as the hand-written file) ---
const num = (n) => (Number.isInteger(n) ? String(n) : String(n))
const shape = (s) => s.kind === 'box' ? `box(${num(s.x1)}, ${num(s.y1)}, ${num(s.x2)}, ${num(s.y2)})`
  : s.kind === 'ellipse' ? (s.rot ? `{ kind: 'ellipse', cx: ${num(s.cx)}, cy: ${num(s.cy)}, rx: ${num(s.rx)}, ry: ${num(s.ry)}, rot: ${num(s.rot)} }` : `ell(${num(s.cx)}, ${num(s.cy)}, ${num(s.rx)}, ${num(s.ry)})`)
  : s.kind === 'polygon' ? `{ kind: 'polygon', pts: [${s.pts.map(([x, y]) => `[${num(x)}, ${num(y)}]`).join(', ')} ] }`
  : `quad(${num(s.cxTop)}, ${num(s.yTop)}, ${num(s.wTop)}, ${num(s.cxBot)}, ${num(s.yBot)}, ${num(s.wBot)})`
const nm = (s) => 'name' in s ? `name: ${JSON.stringify(s.name)}` : `names: { ant: ${JSON.stringify(s.names.ant)}, post: ${JSON.stringify(s.names.post)} }`
const region = (s, ind) => { const p = [nm(s)]; if (s.side === 'left') p.push("side: 'left'"); p.push(`group: '${s.group}'`, `tbsa: ${num(s.tbsa)}`, `shape: ${shape(s.shape)}`); if ('priority' in s) p.push(`priority: ${num(s.priority)}`); return `${ind}{ ${p.join(', ')} },` }
const L = ["export const BODY_REGION_DATA: BodyRegionData = {", "  head: {", "    anterior: ["]
d.head.anterior.forEach((s) => L.push(region(s, "      "))); L.push("    ],", "    posterior: [")
d.head.posterior.forEach((s) => L.push(region(s, "      "))); L.push("    ],", "  },", "  central: [")
d.central.forEach((s) => L.push(region(s, "    "))); L.push("  ],", "  left: [")
for (const e of d.left) {
  if ('fingers' in e) { L.push("    { fingers: ["); e.fingers.forEach((f) => L.push(`      { label: ${JSON.stringify(f.label)}, rootX: ${num(f.rootX)}, rootY: ${num(f.rootY)}, ang: ${num(f.ang)}, w: ${num(f.w)}, lens: [${f.lens.map(num).join(', ')}], tbsa: [${f.tbsa.map(num).join(', ')}] },`)); L.push("    ] },") }
  else if ('toes' in e) { L.push("    { toes: ["); e.toes.forEach((t) => L.push(`      { label: ${JSON.stringify(t.label)}, cx: ${num(t.cx)}, w: ${num(t.w)}, len: ${num(t.len)}, yTop: ${num(t.yTop)}${t.ang ? `, ang: ${num(t.ang)}` : ''} },`)); L.push("    ] },") }
  else L.push(region(e, "    "))
}
L.push("  ],", "}")
// preserve the file header (types + helpers) up to the const, then write in place
import { writeFileSync } from 'fs'
const DST = 'packages/core/src/domain/body-regions.data.ts'
const cur = readFileSync(DST, 'utf8').split('\n')
const start = cur.findIndex((l) => l.startsWith('export const BODY_REGION_DATA'))
writeFileSync(DST, cur.slice(0, start).join('\n') + '\n' + L.join('\n') + '\n')
console.error('tiled ->', DST)
