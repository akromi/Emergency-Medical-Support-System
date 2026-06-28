// NEMSIS v3.5 / OADS v4.0 export shapes.
//
// This is a CONFORMANCE FOUNDATION, not a certified export: it maps the fields
// TRIAGE-LINK captures onto the corresponding NEMSIS v3.5 sections/elements (and,
// where they align, OADS v4.0 data elements). Element identifiers and value-set
// codes are our best mapping and MUST be reconciled against the official NEMSIS
// v3.5.0 data dictionary / XSD (and the Ontario OADS v4.0 spec) before any
// certification submission. See docs/ontario-ems/conformance-plan.md.

/** One mapped data element within a NEMSIS section. */
export interface NemsisElement {
  /** NEMSIS element id (e.g. "ePatient.02"). Undefined where TRIAGE-LINK holds
   *  the data but the precise element is still to be confirmed against the XSD. */
  id?: string
  /** Human-readable element name (unambiguous even if `id` is pending). */
  name: string
  /** The value(s); already string-coerced, ready for XML/JSON serialization. */
  value: string | string[]
}

/** A NEMSIS top-level section (e.g. "ePatient", "eVitals") and its elements. */
export interface NemsisSection {
  section: string
  elements: NemsisElement[]
}

/** The structured, section-organized export for one casualty record. */
export interface NemsisRecord {
  /** Source PCR id (eRecord.01). */
  patientCareReportNumber: string
  /** Standard + dataset version this was mapped against (for provenance). */
  standard: 'NEMSIS' | 'OADS'
  version: string
  sections: NemsisSection[]
  /** Elements a complete OADS/NEMSIS record requires that TRIAGE-LINK does not
   *  yet capture — surfaced so conformance gaps are explicit, not silent. */
  gaps: string[]
}
