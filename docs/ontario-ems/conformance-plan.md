# Ontario EMS — OADS v4.0 + NEMSIS v3.5 conformance plan

> Branch `market/ontario-ems`. The regulated official-EMS path requires
> conformance to the **Ontario Ambulance Documentation Standard (OADS) v4.0**
> (mandatory provincial data set) and interoperability via **NEMSIS v3.5**
> (the North American EMS data standard OADS aligns to). This is the sequenced
> plan; PR-1 lands the export *foundation*.

## Where we are (PR-1)

`@triage-link/core` now has a NEMSIS-shaped exporter — `toNemsisRecord(record)`
(`src/nemsis/`) — that maps the data TRIAGE-LINK captures onto NEMSIS v3.5
sections and surfaces the conformance **gaps** explicitly:

| NEMSIS section | Mapped from TRIAGE-LINK | Status |
|---|---|---|
| `eRecord` | record id (PCR number) | mapped |
| `ePatient` | tombstone: name (split), DOB, sex, MRN, address | mapped (address sub-elements TBD) |
| `eSituation` | incident time + location | partial |
| `eInjury` | mechanism + logged injuries | mapped |
| `eVitals` (per set) | HR, BP→SBP/DBP, RR, SpO₂, GCS, pain | mapped |
| `eProcedures` / `eMedications` | treatments (split by type) | mapped |
| `eDisposition` | handover facility/clinician/time + field triage | mapped |

**Conformance caveat (important):** element ids (`ePatient.02`, `eVitals.06`, …)
and value-set codes are our **best mapping** and are **not yet validated against
the official NEMSIS v3.5.0 XSD / OADS v4.0 data dictionary**. That validation is
a certification gate, not a coding detail — see "Next" below.

## Capture gaps (what a complete OADS/NEMSIS record needs that we don't have)

Surfaced at runtime via `NemsisRecord.gaps` — now reported *dynamically* (a gap
clears once its data is captured), and the build backlog:

- **`eResponse`** — agency, unit/vehicle, response mode. *Captured (PR-3a)*; the
  gap clears when agency + unit are entered.
- **`eTimes`** — the full PSAP→dispatch→en-route→at-scene→at-patient→transport→
  at-destination chain. *Captured (PR-3a)*; the gap clears when the required
  field-care chain (dispatch, at-scene, at-patient, transport, at-destination)
  is complete.
- **`eCrew`** — crew member names, roles, certification levels (seeded from the
  operator roster). *Captured (PR-3b)*; the gap clears when ≥1 crew member is
  added. Role/cert remain free text pending the NEMSIS crew-role/cert value sets.
- **`eScene`** — GPS, incident location type, mass-casualty flag. *Captured
  (PR-3b)*; the gap clears when GPS + location type are set.
- **`ePayment` / `eOutcome`** — billing + linked hospital outcome (DI linkage).

## Sequenced build

1. **PR-1:** NEMSIS section exporter + gap surfacing + tests *(done)*.
2. **PR-2a:** Offline XML serializer — `toNemsisXml(record)` (`src/nemsis/xml.ts`)
   renders the mapped sections as deterministic, NEMSIS v3.5-shaped XML, using
   each element's id as its tag (human label kept as a `name` attribute) and
   emitting the conformance gaps as a clearly-marked, non-schema annotation
   block. Offline-buildable, no external dictionaries needed *(done)*.
3. **PR-2b:** Pluggable conformance validator — `validateNemsisRecord(record,
   ruleset)` (`src/nemsis/validation.ts`) checks a record against a declarative
   `ConformanceRuleset` (element cardinality, datatype, value-set codes — the
   same constraint classes an XSD encodes) and returns structured issues. Ships
   a clearly-marked `PLACEHOLDER_RULESET` (`source: 'placeholder'`) so the
   validator + its CI test run offline today; every result carries
   `rulesetSource` so a placeholder pass is never mistaken for certification.
   *Reconciliation* (PR-2c) still needs the official files — see below *(done)*.
4. **PR-2c:** Official-dictionary reconciliation — generate a
   `ConformanceRuleset` with `source: 'official'` from the real NEMSIS v3.5.0 +
   OADS v4.0 dictionaries (locking element ids + code lists), and add a true XSD
   validation of the serialized XML. Needs the official spec files; drops into
   the PR-2b validator with no code change.
5. **PR-3a:** Capture eResponse + eTimes — a "Response & times" PWA panel (EMS
   agency/unit/mode + the dispatch→destination time chain), mapped into the
   exporter's `eResponse`/`eTimes` sections, with the two gaps now cleared
   dynamically when filled. Tutorial step + i18n (×4) updated *(done)*.
6. **PR-3b:** Capture eCrew + eScene — a "Crew & scene" PWA panel: a per-record
   care-crew roster (name/role/cert, one-tap seed from the on-duty operator) and
   scene GPS + location type + mass-casualty flag, mapped into the exporter's
   `eCrew`/`eScene` sections with both gaps cleared dynamically. Tutorial step +
   i18n (×4) updated *(done)*. All four capture gaps now close at runtime.
7. **PR-3c:** In-app conformance view — a read-only "Conformance" panel
   (`src/components/NemsisConformance.tsx`) that, for the current record, surfaces
   the live capture **gaps** and runs `validateNemsisRecord` against
   `PLACEHOLDER_RULESET`, listing the validator's errors/warnings and exposing the
   PR-2a shaped-XML export. A prominent banner + the result's `rulesetSource`
   make clear this is an offline pre-check, **not** certification. Tutorial step +
   i18n (×4) updated *(done)*.
8. **PR-4:** Productionize the ONE ID / Ontario Health PCR `$match` + DHDR
   integration in `packages/ehr-gateway` (real mTLS client cert, token flow).
9. **PR-5+:** CAD/dispatch + hospital-EHR handover; SOC 2 Type II + QMS evidence;
   certified-SaMD evidence stack (gated on the intended-use determination).

## Validation gate

No OADS/NEMSIS export is "conformant" until it passes the official XSD and the
OADS v4.0 business-rule validation. The PR-2a serializer is shaped XML only. The
PR-2b validator runs the same *classes* of check (cardinality, datatype, value
sets) offline, but against a **placeholder** ruleset — every result carries
`rulesetSource: 'placeholder'`, which is explicitly **not** certification.
Certification waits on PR-2c: the official dictionary generated into a
`source: 'official'` ruleset plus true XSD validation of the XML. Nothing ships
to a provincial submission before then.
