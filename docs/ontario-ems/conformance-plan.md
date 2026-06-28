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
- **`eCrew`** — crew member ids, roles, certification levels (the operator roster
  is the seed; needs NEMSIS crew structure + cert codes). *PR-3b.*
- **`eScene`** — GPS, incident location type, mass-casualty flag/role. *PR-3b.*
- **`ePayment` / `eOutcome`** — billing + linked hospital outcome (DI linkage).

## Sequenced build

1. **PR-1:** NEMSIS section exporter + gap surfacing + tests *(done)*.
2. **PR-2a:** Offline XML serializer — `toNemsisXml(record)` (`src/nemsis/xml.ts`)
   renders the mapped sections as deterministic, NEMSIS v3.5-shaped XML, using
   each element's id as its tag (human label kept as a `name` attribute) and
   emitting the conformance gaps as a clearly-marked, non-schema annotation
   block. Offline-buildable, no external dictionaries needed *(done)*.
3. **PR-2b:** XSD/value-set reconciliation — pull the official NEMSIS v3.5.0 +
   OADS v4.0 dictionaries, lock element ids + code lists, and add a
   schema-validation test asserting the serializer output passes the XSD. This
   is the certification gate and needs the official spec files.
4. **PR-3a:** Capture eResponse + eTimes — a "Response & times" PWA panel (EMS
   agency/unit/mode + the dispatch→destination time chain), mapped into the
   exporter's `eResponse`/`eTimes` sections, with the two gaps now cleared
   dynamically when filled. Tutorial step + i18n (×4) updated *(done)*.
5. **PR-3b:** Capture eCrew + eScene — crew roster (ids/roles/cert levels) and
   scene GPS / location type. eCrew seeds from the operator roster.
6. **PR-4:** Productionize the ONE ID / Ontario Health PCR `$match` + DHDR
   integration in `packages/ehr-gateway` (real mTLS client cert, token flow).
7. **PR-5+:** CAD/dispatch + hospital-EHR handover; SOC 2 Type II + QMS evidence;
   certified-SaMD evidence stack (gated on the intended-use determination).

## Validation gate

No OADS/NEMSIS export is "conformant" until it passes the official XSD and the
OADS v4.0 business-rule validation. The PR-2a serializer is shaped XML only;
PR-2b makes XSD validation a CI test. Nothing ships to a provincial submission
before then.
