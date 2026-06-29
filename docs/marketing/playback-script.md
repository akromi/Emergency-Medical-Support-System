# TRIAGE-LINK — capability deck playback script

A presenter's script for `triage-link-overview.html` / `.pdf` (26 slides). Each
slide has a **say** block (speak it close to verbatim, or paraphrase), **points**
(what must land), and a **transition** into the next slide. Speaker timings add up
to ~20 minutes for the full deck.

**How to use**
- **Full briefing (~18–22 min):** every slide, every say block.
- **Short pitch (~7 min):** slides **1, 2, 3, 5, 14, 16, 20, 26** — the story, the
  architecture, one capture screen, the locked vault, the audit log, the flavors,
  the close. (Marked ⏩ below.)
- **Live-demo variant:** wherever a slide shows a screenshot, you can instead drive
  the running PWA — the deck mirrors the real UI. The clicks are noted under **demo**.
- Numbers, gaps, and "NOT certification" language are deliberate — keep them. Never
  claim certification, FDA/MDR clearance, or live ONE ID connectivity.

---

## 1 · Title — TRIAGE-LINK ⏩
**say:** "TRIAGE-LINK is an offline-first progressive web app for documenting and
coordinating casualties in the field — where the network is unreliable, saturated,
or simply not there. One field record, captured entirely on the device, that can
later sync and hand off cleanly when connectivity exists."
**points:** offline-FIRST, not offline-tolerant · field casualty documentation · a
product line, not a demo.
**transition:** "Let me start with the problem it's built around."

## 2 · Positioning — One field record, no signal required ⏩
**say:** "The core promise: you can document a casualty *completely offline* —
injuries, vitals, treatments, photos, triage and handover — with no server in the
loop. It installs like an app, stores everything locally, and survives reloads,
crashes and power cycles. Sync is optional and never required; it aggregates across
a team only where a deployment actually wants it. And it's one codebase shipped as
three market flavors."
**points:** disaster/MCI, humanitarian clinics, mass-gatherings, prehospital EMS ·
data survives · sync is additive.
**transition:** "That promise is only credible because of how it's architected."

## 3 · Architecture — Offline-first core, optional everything else ⏩
**say:** "Three tiers. The **device PWA** is the whole product on its own — UI,
local database, the sync engine, the encryption vault, operators and audit. The
**sync service** is optional and server-side: multi-tenant, conflict-aware. The
**EHR gateway** is also optional and server-side: ONE ID / Ontario Health, NEMSIS
export, mTLS. The arrows only matter when a deployment turns them on — the PWA is
fully functional with neither tier present."
**points:** dependencies point inward · optional tiers are server-side and off by
default · nothing in the field path depends on the cloud.
**transition:** "Let's go inside the device — capture first."

## 4 · PWA · Capture — Documenting a casualty
**say:** "Capture is built for gloves and speed. You mark injuries by tapping an
anatomical body chart — anterior and posterior, ~150 named regions — pick an injury
type and severity, add notes and wound photos. Burn TBSA is auto-estimated by the
Lund–Browder method for the patient's age band. Identity and incident sit alongside,
and every patient gets a START-style triage tag that drives a colour-coded board."
**points:** body chart + palette · age-aware burn math · START triage.
**transition:** "Here's what that one screen actually looks like."

## 5 · PWA · Screenshot — The field record ⏩
**demo:** open the app; the record screen is the landing view.
**say:** "This is the field record — one screen, fully offline. Triage tag across
the top, patient identity, incident, the injury body-chart, an acuity glance with
GCS and TBSA, and vitals — all captured on-device with no network call."
**points:** it's real, it's one screen, it's offline.
**transition:** "Beyond the snapshot, the clinical detail."

## 6 · PWA · Clinical — Vitals, interventions & trends
**say:** "Vitals are timestamped sets — heart rate, blood pressure, respiratory
rate, SpO₂, GCS, pain — with a built-in GCS calculator. Once you have two readings,
trend sparklines appear, and a time-since-injury clock runs on the record.
Treatments are a structured, timestamped log — tourniquet, airway, decompression,
fluids, medication — each attributed to the operator on duty and feeding the AT-MIST
handover."
**points:** trends from real readings · attribution · feeds handover.
**transition:** "Which brings us to the handoff."

## 7 · PWA · Handover — Summaries & clean handoff
**say:** "Two outputs. A one-page AT-MIST casualty card you print or save as PDF for
the receiving team. And a scene roll-up for command — casualties tallied by triage,
on-scene versus handed-over. Sign-off records who took over care and emits a FHIR
handover bundle; an optional 'Send to EHR' contributes it upstream. Nothing leaves
the device unless you export or sync."
**points:** AT-MIST card · command roll-up · FHIR handover.
**transition:** "Here are both, from the running app."

## 8 · PWA · Screenshot — Handover card & the scene picture
**demo:** open **Summary** (card) and **Board** (scene).
**say:** "On the left, the printable AT-MIST card. On the right, the Triage Board —
every casualty by acuity, searchable, filterable by on-scene versus handed-over.
That's the command picture, built from the same offline records."
**transition:** "Now, who can actually use this — and in what language."

## 9 · PWA · Accessibility — Four languages, guided & spoken
**say:** "Four languages built in — English, French, Arabic and Persian — with full
right-to-left layout for Arabic and Persian. You can load a JSON language pack to add
a language with *no app release*, starting from a downloadable English template;
parity across languages is enforced by a CI test. And every user-visible feature is
taught by a guided, spoken tour."
**points:** RTL is real · language packs need no release · parity is tested.
**transition:** "The tour is worth seeing — here it is running."

## 10 · PWA · Screenshot — The guided tour *(new)*
**demo:** click **❔ Tour**; advance to the body-chart step.
**say:** "A 15-step smart tour spotlights each real control and narrates it with
offline speech synthesis in the active language. It now covers the power features
too — operators, the vault, backup and restore, language packs — not just the
capture flow. Action steps auto-advance: here, dropping a marker on the body chart
moves the tour on by itself."
**points:** spotlights real UI · offline voice-over · teaches the whole product.
**transition:** "Underneath all of this is durable, offline storage."

## 11 · PWA · Platform — Installable, offline, durable
**say:** "It installs as a PWA with a service worker, so it launches and runs with no
network. All data lives in IndexedDB — records, the op-log, photos, the audit chain.
Phones, tablets, laptops; the layout collapses gracefully. No telemetry, no implicit
network calls — a casualty is documented entirely on-device."
**transition:** "When you *do* connect several devices, the data has to reconcile —
that's the sync engine."

## 12 · Data integrity — Conflict-aware op-log sync engine
**say:** "Every change is journaled as an immutable operation — not a blind
overwrite. A deterministic resolve uses Lamport clocks to order edits, and ties break
predictably, so the same inputs give the same result on every device. Concurrent
edits to *different* fields all survive; same-field edits pick a deterministic winner
and *report* the conflict, keeping the losing operation. The server stores and folds
ops — it never invents its own merge logic."
**points:** deterministic, reproducible · conflicts surfaced, not silently lost.
**transition:** "Now the part regulators and security teams ask about first —
data at rest."

## 13 · Security · At rest — Opt-in encryption vault
**say:** "An opt-in vault encrypts the heaviest PHI — wound photos — plus records and
the op-log, with AES-256-GCM and a key derived from a passphrase via PBKDF2 at 210,000
iterations. The key lives only in memory while unlocked; locking drops it, and the app
auto-locks when idle. Crucially it's *default-off*: with no vault, behaviour is
byte-for-byte unchanged and the whole test suite still passes."
**points:** strong crypto · key only in memory · default-off, non-invasive.
**transition:** "Here's what a locked device looks like."

## 14 · Security · Screenshot — Locked ⏩ *(new)*
**demo:** ⋯ menu → **Encrypt data**, then **Lock now**.
**say:** "When the vault is on and the device goes idle, it auto-locks to this
screen. Records, the op-log and wound photos are encrypted at rest and unreadable
until someone re-enters the passphrase — which never leaves memory. A lost or stolen
field tablet is just ciphertext."
**points:** tangible at-rest protection · lost-device story.
**transition:** "Access control and accountability are the other half."

## 15 · Security · Access — Operators, RBAC-lite & tamper-evident audit
**say:** "On a shared device you keep a local operator roster — field, lead, admin.
Records and audit entries are attributed to whoever's on duty, and a step-up PIN gates
sensitive actions like delete and export. The audit log itself is append-only and
hash-chained with SHA-256 — there's no update or delete API, so tampering or deletion
breaks the chain and is detectable *offline*, even while the vault is locked."
**points:** attribution · step-up gate · tamper-evidence without a server.
**transition:** "Both, from the app."

## 16 · Security · Screenshot — Operators & the hash-chained log ⏩ *(new)*
**demo:** ⋯ menu → **Operators**; then ⋯ menu → **Audit log** → **Verify chain**.
**say:** "On the left, the operator roster — name, role, optional PIN, with the
sensitive actions it gates spelled out. On the right, the audit log: time, event,
case and device per entry, and a 'Verify chain' button that recomputes the hash chain
to prove nothing was altered — entirely offline."
**points:** shared-device accountability · provable integrity.
**transition:** "Getting data in and out is just as important as protecting it."

## 17 · Data portability — Backup, restore & export
**say:** "A full JSON backup of every record — plain, or passphrase-encrypted so PHI
stays unreadable without the key — and restore by merge or replace. Plus CSV: export a
roster for analytics or QA, import a patient list from paper or another system, scope
an export to a date range, and stamp deployment provenance on the rows."
**transition:** "Everything so far is the device. Optionally, there's a backend."

## 18 · Hosted backend — Multi-tenant sync service
**say:** "An optional cloud or self-hosted backend on Fastify and PostgreSQL for
cross-team aggregation — the PWA never requires it. Each API key both authenticates
and scopes a tenant's data; the conflict-aware /sync stores and folds the same ops.
It's hardened: sanitised error envelopes, paginated pulls, per-tenant storage quota,
audit-retention TTL, OpenAPI plus Swagger, health probes, per-tenant metrics."
**transition:** "And it's administered securely."

## 19 · Hosted backend · Admin — Admin security & console
**say:** "The tenant-admin API sits behind a static token *or* OIDC single sign-on —
an IdP-issued JWT, audience-checked, with optional role mapping. Admins provision
tenants and issue, rotate or revoke per-tenant keys, and every admin mutation is
written to a separate admin-audit trail. There's an opt-in graphical console that
holds no secrets — the API gate enforces — and it's off by default."
**transition:** "One core, productised three ways."

## 20 · Section — Three market flavors ⏩
**say:** "The same offline-first core ships as three flavors: Humanitarian / NGO,
Ontario EMS as a regulated line, and the productised backend the others share."
**transition:** "Start with the humanitarian line."

## 21 · Flavor · Humanitarian / NGO — Field documentation where the cloud isn't
**say:** "On this line: a device-wide deployment tag with a provenance banner; a
disaster/MCI mode that with one toggle makes encryption mandatory and adds a command
roll-up; kiosk defaults — assign-operator prompt and a two-minute auto-lock on shared
devices; a donor-ready, provenance-stamped CSV with a date-range filter; retention
presets — a confirmed, step-up-gated purge window; and air-gapped packaging — one
Docker stack, PWA plus sync plus Postgres, running offline on a laptop. Intended use is
documentation and coordination — a light regulatory load."
**points:** MCI toggle · retention · air-gap · light reg posture.
**transition:** "The Ontario line is the regulated end of the spectrum."

## 22 · Flavor · Ontario EMS (regulated) — Toward a conformant ePCR
**say:** "Here we map captured data to NEMSIS v3.5 and OADS v4.0 shapes, with a
deterministic offline XML serialiser and a pluggable validator. Capture panels —
eResponse, eTimes, eCrew, eScene — make the data needed for conformance explicit, and
an in-app conformance view shows live gaps and validator issues in four languages. It
is clearly labelled *not* certification: it runs against a placeholder ruleset, and
that source is shown. The ONE ID / Ontario Health gateway is scaffolded with
server-side mTLS. What's gated next is external — the official dictionary and live ONE
ID credentials."
**points:** real NEMSIS pipeline · honest NOT-certification framing · external gates
named.
**transition:** "Here's that conformance view in the app."

## 23 · Flavor · Screenshot — In-app conformance pre-check *(new)*
**demo (Ontario build):** ⋯ menu → **Conformance**.
**say:** "A read-only pre-check: how many sections mapped, validator errors and
warnings, and the capture gaps that remain — eTimes, eResponse, eCrew, eScene. The
amber banner is deliberate: offline pre-check only, *not* certification, against a
placeholder ruleset. It exports shaped NEMSIS v3.5 XML offline so a partner can review
the structure today."
**points:** transparent gaps · governance-friendly honesty.
**transition:** "Both market lines stand on a shared spine."

## 24 · Flavor · Productized backend — The shared, hardened service line
**say:** "The multi-tenant sync service and admin security is the common spine both
market branches reuse — isolation, OIDC SSO with role-based admin, per-tenant rate
limits and quota, incremental sync, and the EHR-access and admin audit trails a
regulated multi-service deployment needs. A hardening fix lands once and cascades to
every flavor."
**transition:** "So where does the whole thing actually stand?"

## 25 · Status — Where things stand
**say:** "Done and merged: the full offline PWA — capture, triage, vitals, handover,
summaries; the vault, operators, step-up and tamper-evident audit; the multi-tenant
backend with the admin console; the humanitarian line's five roadmap items; and the
Ontario NEMSIS pipeline with the in-app conformance view. What's next is *externally*
gated — the official NEMSIS/OADS dictionary and true XSD validation, live ONE ID
credentials and a real mTLS client cert, and the SOC 2 / QMS / SaMD evidence if the
intended use ever crosses the medical-device line."
**points:** lots shipped · the remaining gates are external, and named honestly.
**transition:** "To close —"

## 26 · Closing — Document anywhere. ⏩
**say:** "Document anywhere. Offline-first by design, encrypted and audited, and ready
for the cloud only when you want it. One PWA, an optional multi-tenant backend, and
Humanitarian and Ontario EMS flavors on a shared core. Happy to go deep on any tier —
or open the running app and drive it live."
**points:** restate the promise · invite the live demo / deep dive.

---

### Quick-reference timing

| Segment | Slides | ~min |
|---|---|---|
| Story & architecture | 1–3 | 3 |
| The PWA (capture → tour) | 4–11 | 7 |
| Sync & security | 12–17 | 5 |
| Backend & admin | 18–19 | 2 |
| Flavors & status | 20–25 | 4 |
| Close | 26 | 1 |

### Do-not-say list
- "Certified" / "compliant" / "cleared" — say *toward conformance*, *pre-check*.
- "Connected to ONE ID / Ontario Health" — say *scaffolded*, *gated on credentials*.
- "Medical device" — say *documentation & coordination tool*; device classification
  is a named future gate, not a present claim.
