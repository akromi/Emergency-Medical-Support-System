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

Surfaced at runtime via `NemsisRecord.gaps`, and the build backlog:

- **`eResponse`** — agency, unit/vehicle, response mode, dispatch/response times.
- **`eCrew`** — crew member ids, roles, certification levels (the operator roster
  is the seed; needs NEMSIS crew structure + cert codes).
- **`eTimes`** — the full PSAP→at-scene→at-patient→transport→at-destination chain
  (we capture injury time + handover time only).
- **`eScene`** — GPS, incident location type, mass-casualty flag/role.
- **`ePayment` / `eOutcome`** — billing + linked hospital outcome (DI linkage).

## Sequenced build

1. **PR-1 (this):** NEMSIS section exporter + gap surfacing + tests *(done)*.
2. **PR-2:** XSD/value-set reconciliation — pull the official NEMSIS v3.5.0 +
   OADS v4.0 dictionaries, lock element ids + code lists, add an XML serializer
   and schema-validation test against the XSD.
3. **PR-3:** Capture the gap fields (eResponse/eCrew/eTimes/eScene) — new
   data-entry surfaces in the PWA (tutorial + i18n updates as usual).
4. **PR-4:** Productionize the ONE ID / Ontario Health PCR `$match` + DHDR
   integration in `packages/ehr-gateway` (real mTLS client cert, token flow).
5. **PR-5+:** CAD/dispatch + hospital-EHR handover; SOC 2 Type II + QMS evidence;
   certified-SaMD evidence stack (gated on the intended-use determination).

## Validation gate

No OADS/NEMSIS export is "conformant" until it passes the official XSD and the
OADS v4.0 business-rule validation. PR-2 makes that a CI test; nothing ships to a
provincial submission before then.
