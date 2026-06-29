# TRIAGE-LINK (Ontario EMS) — capability deck playback script

Presenter script for the **Ontario EMS flavor** deck `triage-link-overview.html` /
`.pdf` (27 slides). Each slide has a **say** block (speak close to verbatim), **points**
(what must land), and a **transition**. Full read ≈ 20 minutes.

**How to use**
- **Full briefing (~20 min):** every slide.
- **Regulated-buyer short pitch (~8 min):** slides **1, 2, 3, 5, 14, 16, 22, 23, 26, 27**
  — story, architecture, a capture screen, the locked vault, the audit log, the Ontario
  conformance story (twocol + the in-app view), status, close. (Marked ⏩.)
- **Live-demo variant:** every screenshot slide can be driven in the running PWA — the
  deck mirrors the real UI. Demo clicks are noted under **demo**.
- This is the **regulated** cut. Keep the honesty discipline: it is *toward* conformance,
  a *pre-check*, *scaffolded* ONE ID — never "certified", "compliant", or "connected".

---

## 1 · Title — TRIAGE-LINK ⏩
**say:** "TRIAGE-LINK is an offline-first progressive web app for documenting and
coordinating casualties in the field. This is the Ontario EMS cut — the same offline core,
pointed at a conformant ePCR: NEMSIS v3.5 / OADS v4.0 shaping, an in-app conformance
pre-check, and a server-side ONE ID / Ontario Health gateway."
**points:** offline-FIRST · regulated target · one record from scene to EHR.
**transition:** "Start with the problem it's built around."

## 2 · Positioning — One field record, no signal required ⏩
**say:** "You document a casualty *completely offline* — injuries, vitals, treatments,
photos, triage, handover — with no server in the loop. It installs like an app, stores
everything locally, and survives reloads and power cycles. For prehospital EMS that means
the ePCR starts at the scene, on a tablet, with no bars of signal — and reconciles later."
**points:** prehospital reality · data survives · sync is additive.
**transition:** "That's credible because of the architecture."

## 3 · Architecture — Offline-first core, optional everything else ⏩
**say:** "Three tiers. The **device PWA** is the whole product on its own. The **sync
service** is optional, server-side, multi-tenant. The **EHR gateway** is optional and
server-side — ONE ID / Ontario Health, NEMSIS export, mTLS. The arrows only matter when a
deployment turns them on; the PWA is fully functional with neither tier present, which is
exactly what you want when the network is the least reliable thing on scene."
**points:** optional tiers are server-side · field path never depends on the cloud.
**transition:** "Inside the device — capture first."

## 4 · PWA · Capture — Documenting a casualty
**say:** "Capture is built for gloves and speed: mark injuries on an anatomical body chart,
anterior and posterior, ~150 named regions; pick type and severity; add notes and wound
photos; burn TBSA auto-estimated by Lund–Browder for the age band. Identity and incident
sit alongside, and a START-style triage tag drives the colour-coded board."
**transition:** "Here's that one screen."

## 5 · PWA · Screenshot — The field record ⏩
**demo:** open the app; the record screen is the landing view.
**say:** "One screen, fully offline — triage tag, identity, incident, the injury body-chart,
an acuity glance with GCS and TBSA, and vitals, all on-device with no network call."
**transition:** "Beyond the snapshot, the clinical detail."

## 6 · PWA · Clinical — Vitals, interventions & trends
**say:** "Timestamped vital sets — HR, BP, RR, SpO₂, GCS, pain — with a built-in GCS
calculator. Two readings and trend sparklines appear; a time-since-injury clock runs.
Treatments are a structured, timestamped log, each attributed to the on-duty operator and
feeding the AT-MIST handover."
**transition:** "Which brings us to the handoff."

## 7 · PWA · Handover — Summaries & clean handoff
**say:** "A one-page AT-MIST casualty card to print or save as PDF, and a scene roll-up for
command. Sign-off records who took over care and emits a FHIR handover bundle; an optional
'Send to EHR' contributes it upstream through the gateway. Nothing leaves the device unless
you export or sync."
**transition:** "Both, from the app."

## 8 · PWA · Screenshot — Handover card & the scene picture
**demo:** open **Summary** and **Board**.
**say:** "The printable AT-MIST card, and the Triage Board — every casualty by acuity,
searchable, filterable by on-scene versus handed-over: the command picture from the same
offline records."
**transition:** "Who can use it, and in what language."

## 9 · PWA · Accessibility — Four languages, guided & spoken
**say:** "English, French, Arabic and Persian built in, with full RTL for Arabic and
Persian. Loadable JSON language packs add a language with no app release; parity is
CI-enforced. And every user-visible feature is taught by a guided, spoken tour."
**transition:** "Here's the tour running."

## 10 · PWA · Screenshot — The guided tour *(new)*
**demo:** click **❔ Tour**; advance to the body-chart step.
**say:** "A 15-step smart tour spotlights each real control and narrates it offline in the
active language — now covering operators, the vault, backup and restore, and language
packs, not just capture. Action steps auto-advance: dropping a marker moves the tour on by
itself. For a regulated rollout, that's onboarding with no trainer required."
**transition:** "Underneath is durable, offline storage."

## 11 · PWA · Platform — Installable, offline, durable
**say:** "Installs as a PWA with a service worker, so it launches and runs with no network.
All data in IndexedDB — records, op-log, photos, audit chain. Phones, tablets, laptops. No
telemetry, no implicit network calls."
**transition:** "When you connect several devices, the data reconciles — the sync engine."

## 12 · Data integrity — Conflict-aware op-log sync engine
**say:** "Every change is journaled as an immutable operation, not a blind overwrite. A
deterministic resolve orders edits by Lamport clocks; ties break predictably, so every
device converges to the same result. Concurrent edits to different fields all survive;
same-field edits pick a deterministic winner and *report* the conflict. The server stores
and folds ops — it never invents its own merge."
**points:** deterministic, reproducible, auditable.
**transition:** "Now data at rest."

## 13 · Security · At rest — Opt-in encryption vault
**say:** "An opt-in vault encrypts wound photos, records and the op-log with AES-256-GCM,
key derived from a passphrase via PBKDF2 at 210,000 iterations. The key lives only in
memory while unlocked; idle devices auto-lock. It's default-off: with no vault, behaviour
is byte-for-byte unchanged and the suite still passes."
**transition:** "Here's a locked device."

## 14 · Security · Screenshot — Locked ⏩ *(new)*
**demo:** ⋯ menu → **Encrypt data**, then **Lock now**.
**say:** "On and idle, the device auto-locks to this screen. Records, op-log and photos are
encrypted at rest, unreadable until the passphrase is re-entered — which never leaves
memory. A lost field tablet is just ciphertext: a concrete answer to the PHI-on-a-device
question."
**transition:** "Access control and accountability are the other half."

## 15 · Security · Access — Operators, RBAC-lite & tamper-evident audit
**say:** "A local operator roster — field, lead, admin. Records and audit entries are
attributed to the on-duty operator; a step-up PIN gates sensitive actions. The audit log is
append-only and hash-chained with SHA-256 — no update or delete API, so tampering breaks
the chain and is detectable offline, even with the vault locked."
**transition:** "Both, from the app."

## 16 · Security · Screenshot — Operators & the hash-chained log ⏩ *(new)*
**demo:** ⋯ menu → **Operators**; then **Audit log** → **Verify chain**.
**say:** "The operator roster with the sensitive actions a PIN gates spelled out; and the
audit log — time, event, case, device per entry, with a 'Verify chain' button that
recomputes the hash chain to prove nothing was altered. Offline-provable integrity is the
backbone of any defensible record."
**transition:** "Getting data in and out matters as much as protecting it."

## 17 · Data portability — Backup, restore & export
**say:** "Full JSON backup — plain or passphrase-encrypted — and restore by merge or
replace. Plus CSV: roster export for analytics, import from paper or another system, a
date-range scope, and deployment provenance on rows."
**transition:** "Optionally, a backend."

## 18 · Hosted backend — Multi-tenant sync service
**say:** "An optional Fastify + PostgreSQL backend for cross-team aggregation — never
required. Each API key authenticates and scopes a tenant's data; the conflict-aware /sync
folds the same ops. Hardened: sanitised errors, paginated pulls, per-tenant quota,
audit-retention TTL, OpenAPI + Swagger, health probes, metrics."
**transition:** "Administered securely."

## 19 · Hosted backend · Admin — Admin security & console
**say:** "The tenant-admin API sits behind a static token or OIDC SSO — IdP-issued JWT,
audience-checked, optional role mapping. Admins provision tenants and rotate per-tenant
keys; every admin mutation hits a separate admin-audit trail. An opt-in console holds no
secrets and is off by default."
**transition:** "One core, productised three ways."

## 20 · Section — Three market flavors ⏩
**say:** "The same offline core ships as three flavors — Humanitarian / NGO, Ontario EMS as
the regulated line, and the productised backend they share. This deck is the Ontario cut, so
let's spend our time there."
**transition:** "First, briefly, the humanitarian sibling."

## 21 · Flavor · Humanitarian / NGO — Field documentation where the cloud isn't
**say:** "The humanitarian line adds a deployment tag and provenance banner, a one-toggle
disaster/MCI mode that makes encryption mandatory, kiosk defaults, donor-ready CSV,
retention presets, and air-gapped Docker packaging. Same core, lighter regulatory load —
useful contrast for where Ontario sits."
**transition:** "Now the Ontario line — the regulated end of the spectrum."

## 22 · Flavor · Ontario EMS (regulated) — Toward a conformant ePCR ⏩
**say:** "We map captured data to NEMSIS v3.5 and OADS v4.0 shapes, with a deterministic
offline XML serialiser and a pluggable validator. Dedicated capture panels — eResponse,
eTimes, eCrew, eScene — make the data conformance needs explicit, and an in-app conformance
view shows live gaps and validator issues in four languages. It is clearly *not*
certification: it runs against a placeholder ruleset, shown as such. The ONE ID / Ontario
Health gateway is scaffolded with server-side mTLS. What's gated next is external — the
official dictionary and live ONE ID credentials."
**points:** real NEMSIS pipeline · honest NOT-certification framing · external gates named.
**transition:** "Here is that conformance view, in the app."

## 23 · Flavor · Ontario EMS — In-app NEMSIS/OADS conformance view ⏩
**demo:** ⋯ menu → **Conformance**.
**say:** "A read-only pre-check: sections mapped, validator errors and warnings, and the
capture gaps that remain — eTimes, eResponse, eCrew, eScene. The amber banner is deliberate:
offline pre-check only, *not* certification, against a placeholder ruleset. It exports shaped
NEMSIS v3.5 XML offline, so a provincial partner can review the structure today, before any
credentials exist."
**points:** transparent gaps · governance-friendly honesty · something to hand a reviewer now.
**transition:** "And the capture that feeds it."

## 24 · Flavor · Ontario EMS — eResponse / eTimes capture panel
**demo:** scroll the record to the **Response & times** panel.
**say:** "The 'Response & times' panel captures EMS agency, unit and response mode, and the
dispatch-to-destination time chain — the eResponse and eTimes sections NEMSIS expects. The
conformance view's gaps shrink as these fill, so the path from capture to conformant export
is visible and concrete, not hand-waved."
**transition:** "Both market lines stand on a shared spine."

## 25 · Flavor · Productized backend — The shared, hardened service line
**say:** "The multi-tenant sync service and admin security is the common spine both branches
reuse — isolation, OIDC SSO, per-tenant limits and quota, incremental sync, EHR-access and
admin audit trails. A hardening fix lands once and cascades to every flavor."
**transition:** "So where does the Ontario line actually stand?"

## 26 · Status — Where things stand ⏩
**say:** "Done and merged: the full offline PWA; the vault, operators, step-up and
tamper-evident audit; the multi-tenant backend and console; and the Ontario NEMSIS pipeline
with capture panels and the in-app conformance view. What's next is *externally* gated — the
official NEMSIS/OADS dictionary and true XSD validation, live ONE ID credentials and a real
mTLS client cert, and SOC 2 / QMS / SaMD evidence if the intended use crosses the
device line."
**points:** lots shipped · remaining gates are external and named honestly.
**transition:** "To close —"

## 27 · Closing — Document anywhere. ⏩
**say:** "Document anywhere. Offline-first by design, encrypted and audited, and on a clear,
honest path toward a conformant Ontario ePCR. Happy to go deep on the NEMSIS pipeline, the
gateway, or the security model — or open the running app and drive it live."

---

### Quick-reference timing

| Segment | Slides | ~min |
|---|---|---|
| Story & architecture | 1–3 | 3 |
| The PWA (capture → tour) | 4–11 | 7 |
| Sync & security | 12–17 | 5 |
| Backend & admin | 18–19 | 2 |
| Flavors (Ontario focus) | 20–25 | 5 |
| Status & close | 26–27 | 2 |

### Do-not-say list
- "Certified" / "compliant" / "conformant record" — say *toward conformance*, *pre-check*,
  *shaped export*.
- "Connected to ONE ID / Ontario Health" — say *scaffolded*, *gated on credentials*.
- "Medical device" — say *documentation & coordination tool*; device classification is a
  named future gate, not a present claim.
