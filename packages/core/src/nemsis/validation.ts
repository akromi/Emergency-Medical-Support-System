// A pluggable conformance validator for a NemsisRecord (see ./types.ts).
//
// This is the offline half of the NEMSIS v3.5.0 / OADS v4.0 conformance gate.
// Full certification ultimately means validating the serialized XML against the
// OFFICIAL NEMSIS XSD + business rules. We cannot ship that schema here, so this
// module validates the STRUCTURED record against a declarative `ConformanceRuleset`
// — the same classes of constraint an XSD/value-set encodes: element presence
// (cardinality), datatype, and allowed value-set codes.
//
// The ruleset is DATA, not code: when the official NEMSIS/OADS dictionary is
// available it is generated into a `ConformanceRuleset` (source: 'official') and
// dropped in — no validator change. `./ruleset-placeholder.ts` ships a small,
// clearly-marked subset so the validator + its CI test exist and pass today.
import type { NemsisRecord } from './types.js'

/** How required an element is. `required` failures are errors; `recommended`
 *  failures are warnings; `optional` is never flagged for absence. */
export type Cardinality = 'required' | 'recommended' | 'optional'

export type ElementDatatype = 'string' | 'date' | 'dateTime' | 'number' | 'code'

/** One element's conformance rule, keyed by NEMSIS element id (e.g. 'ePatient.13'). */
export interface ElementRule {
  id: string
  cardinality: Cardinality
  datatype?: ElementDatatype
  /** Allowed value-set codes. When present, a non-empty value must be one of
   *  these (the element is treated as a coded element). */
  valueSet?: string[]
}

/** A declarative ruleset — the official dictionary or a placeholder subset. */
export interface ConformanceRuleset {
  standard: string
  version: string
  /** Provenance, so a caller never mistakes a placeholder pass for certification. */
  source: 'placeholder' | 'official'
  elements: ElementRule[]
}

export type Severity = 'error' | 'warning'

export type IssueCode =
  | 'missing-required'
  | 'missing-recommended'
  | 'unknown-code'
  | 'bad-datatype'
  | 'unmapped-element'

export interface ValidationIssue {
  severity: Severity
  code: IssueCode
  elementId?: string
  message: string
}

export interface ValidationResult {
  /** True when there are no `error`-severity issues. NOT a certification claim —
   *  see `rulesetSource`. */
  valid: boolean
  issues: ValidationIssue[]
  /** Mirrors the ruleset's provenance: a 'placeholder' pass is not conformance. */
  rulesetSource: 'placeholder' | 'official'
}

export interface ValidateOptions {
  /** When true, flag record elements that have NO rule in the ruleset (helps
   *  detect drift once the official dictionary is in). Off by default so a
   *  partial placeholder ruleset doesn't drown the result in warnings. */
  strict?: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Accepts both `datetime-local` (YYYY-MM-DDTHH:mm) and full ISO-8601 (with
// seconds / fractional / timezone) — the mapping emits both shapes.
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/

/** Flatten a record's elements into an id → values map (skipping id-less ones). */
function indexById(rec: NemsisRecord): Map<string, string[]> {
  const byId = new Map<string, string[]>()
  for (const section of rec.sections) {
    for (const el of section.elements) {
      if (!el.id) continue
      const values = Array.isArray(el.value) ? el.value : [el.value]
      const nonEmpty = values.filter((v) => v != null && v !== '')
      if (nonEmpty.length === 0) continue
      const prev = byId.get(el.id)
      if (prev) prev.push(...nonEmpty)
      else byId.set(el.id, [...nonEmpty])
    }
  }
  return byId
}

function datatypeOk(datatype: ElementDatatype, value: string): boolean {
  switch (datatype) {
    case 'date':
      return DATE_RE.test(value)
    case 'dateTime':
      return DATETIME_RE.test(value)
    case 'number':
      return value.trim() !== '' && !Number.isNaN(Number(value))
    case 'string':
    case 'code':
      return true // value-set membership is checked separately for codes
  }
}

/**
 * Validate a structured NemsisRecord against a ConformanceRuleset. Pure and
 * deterministic. Returns `valid: true` only when there are no error-severity
 * issues — but never treat a `placeholder` pass as certification (see module doc).
 */
export function validateNemsisRecord(
  rec: NemsisRecord,
  ruleset: ConformanceRuleset,
  opts: ValidateOptions = {},
): ValidationResult {
  const byId = indexById(rec)
  const issues: ValidationIssue[] = []
  const ruled = new Set(ruleset.elements.map((r) => r.id))

  for (const rule of ruleset.elements) {
    const values = byId.get(rule.id) ?? []
    if (values.length === 0) {
      if (rule.cardinality === 'required') {
        issues.push({ severity: 'error', code: 'missing-required', elementId: rule.id,
          message: `Required element ${rule.id} is missing or empty.` })
      } else if (rule.cardinality === 'recommended') {
        issues.push({ severity: 'warning', code: 'missing-recommended', elementId: rule.id,
          message: `Recommended element ${rule.id} is absent.` })
      }
      continue
    }
    for (const value of values) {
      if (rule.datatype && !datatypeOk(rule.datatype, value)) {
        issues.push({ severity: 'error', code: 'bad-datatype', elementId: rule.id,
          message: `Element ${rule.id} value "${value}" is not a valid ${rule.datatype}.` })
      }
      if (rule.valueSet && !rule.valueSet.includes(value)) {
        issues.push({ severity: 'error', code: 'unknown-code', elementId: rule.id,
          message: `Element ${rule.id} value "${value}" is not in its value set.` })
      }
    }
  }

  if (opts.strict) {
    for (const id of byId.keys()) {
      if (!ruled.has(id)) {
        issues.push({ severity: 'warning', code: 'unmapped-element', elementId: id,
          message: `Element ${id} has no rule in the ${ruleset.source} ruleset.` })
      }
    }
  }

  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
    rulesetSource: ruleset.source,
  }
}

/** Convenience: the error-severity issues only. */
export const validationErrors = (r: ValidationResult): ValidationIssue[] =>
  r.issues.filter((i) => i.severity === 'error')
