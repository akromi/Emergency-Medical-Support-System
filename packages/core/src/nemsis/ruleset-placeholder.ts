// A PLACEHOLDER conformance ruleset — NOT the official NEMSIS v3.5.0 / OADS v4.0
// dictionary.
//
// It is a small, hand-authored subset that lets the validator (./validation.ts)
// and its CI test exist and run offline. The cardinality flags, datatypes, and
// value-set codes here mirror what ./mapping.ts currently emits; they have NOT
// been reconciled against the official data dictionary. When that dictionary is
// available, generate a `ConformanceRuleset` with `source: 'official'` from it
// and pass THAT to validateNemsisRecord — no validator/mapping change needed.
//
// `source: 'placeholder'` rides along on every ValidationResult so a pass here
// can never be mistaken for certification.
import type { ConformanceRuleset } from './validation.js'

export const PLACEHOLDER_RULESET: ConformanceRuleset = {
  standard: 'NEMSIS',
  version: '3.5.0',
  source: 'placeholder',
  elements: [
    // The PCR number is the one element always present (eRecord.01).
    { id: 'eRecord.01', cardinality: 'required', datatype: 'string' },
    // Patient identity.
    { id: 'ePatient.05', cardinality: 'optional', datatype: 'date' }, // DOB
    {
      id: 'ePatient.13', // gender — coded
      cardinality: 'optional',
      datatype: 'code',
      valueSet: ['9906001', '9906003', '9906007', '9906009'],
    },
    // Response context — mode is coded.
    {
      id: 'eResponse.23',
      cardinality: 'optional',
      datatype: 'code',
      valueSet: ['2207001', '2207009'],
    },
    // A sample of the eTimes chain, datatyped as dateTime.
    { id: 'eTimes.06', cardinality: 'optional', datatype: 'dateTime' }, // at scene
    { id: 'eTimes.11', cardinality: 'optional', datatype: 'dateTime' }, // at destination
    // Disposition — receiving facility is recommended (warns if absent).
    { id: 'eDisposition.01', cardinality: 'recommended', datatype: 'string' },
    { id: 'eDisposition.24', cardinality: 'optional', datatype: 'dateTime' }, // transfer-of-care
  ],
}
