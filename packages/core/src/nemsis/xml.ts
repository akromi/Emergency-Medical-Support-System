// Serialize a NemsisRecord (see ./types.ts) into NEMSIS v3.5-shaped XML.
//
// IMPORTANT — this is NOT a certified export. Element ids and value-set codes
// are our best mapping and are not yet reconciled against the official NEMSIS
// v3.5.0 XSD / OADS v4.0 dictionary (see ./types.ts and the conformance plan),
// so this document will not pass official schema validation until that
// reconciliation (PR-2) lands. The serializer is offline-buildable and fully
// deterministic, which makes it usable for inspection, diffing, and round-trip
// shape tests today.
import type { NemsisElement, NemsisRecord, NemsisSection } from './types.js'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>'

/** Escape the five XML predefined entities for text and attribute contexts. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Turn an element name into a safe XML tag (used only when no NEMSIS id is
 *  available). Strips anything outside [A-Za-z0-9], collapsing the human label
 *  to PascalCase-ish; falls back to "Element" if nothing survives. */
function nameToTag(name: string): string {
  const tag = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  return tag || 'Element'
}

/** NEMSIS uses the numeric element id (e.g. "ePatient.02") as the tag itself.
 *  Periods are valid XML NameChars, so the id is a legal tag. Where we have no
 *  confirmed id we fall back to a sanitized name tag. */
function elementTag(el: NemsisElement): string {
  return el.id ?? nameToTag(el.name)
}

/** Render one element. Array values repeat the tag (NEMSIS multi-value style).
 *  The human-readable `name` is always carried as an attribute so a reader can
 *  interpret an opaque id like `ePatient.02`. */
function renderElement(el: NemsisElement, indent: string): string[] {
  const tag = elementTag(el)
  const attr = ` name="${escapeXml(el.name)}"`
  const values = Array.isArray(el.value) ? el.value : [el.value]
  return values
    .filter((v) => v !== '' && v != null)
    .map((v) => `${indent}<${tag}${attr}>${escapeXml(v)}</${tag}>`)
}

function renderSection(s: NemsisSection, indent: string): string[] {
  const inner = indent + '  '
  const body = s.elements.flatMap((e) => renderElement(e, inner))
  // A section with no renderable values collapses to nothing — callers already
  // drop empty sections, but guard anyway so we never emit an empty wrapper.
  if (body.length === 0) return []
  return [`${indent}<${s.section}>`, ...body, `${indent}</${s.section}>`]
}

/**
 * Serialize a NemsisRecord into NEMSIS v3.5-shaped, pretty-printed XML.
 *
 * The conformance gaps (the OADS/NEMSIS-required data TRIAGE-LINK does not yet
 * capture) are emitted as a clearly-marked `<ConformanceGaps>` block. That block
 * is an annotation, NOT part of the NEMSIS schema — it documents why the export
 * is incomplete and must be stripped before any official submission.
 *
 * Output is deterministic: same record in, byte-identical XML out.
 */
export function toNemsisXml(record: NemsisRecord): string {
  const rootAttrs = [
    `standard="${escapeXml(record.standard)}"`,
    `version="${escapeXml(record.version)}"`,
    `patientCareReportNumber="${escapeXml(record.patientCareReportNumber)}"`,
  ].join(' ')

  const lines: string[] = [XML_DECL, `<PatientCareReport ${rootAttrs}>`]

  if (record.gaps.length > 0) {
    lines.push('  <!-- Conformance gaps: NOT part of the NEMSIS schema. Strip before official submission. -->')
    lines.push('  <ConformanceGaps>')
    for (const gap of record.gaps) lines.push(`    <Gap>${escapeXml(gap)}</Gap>`)
    lines.push('  </ConformanceGaps>')
  }

  for (const s of record.sections) lines.push(...renderSection(s, '  '))

  lines.push('</PatientCareReport>')
  return lines.join('\n') + '\n'
}
