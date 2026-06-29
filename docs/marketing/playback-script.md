# TRIAGE-LINK (Humanitarian / NGO) — capability deck playback script

Presenter script for the **Humanitarian / NGO flavor** deck
`triage-link-overview.html` / `.pdf` (26 slides). Each slide has a **say** block
(speak close to verbatim), **points** (what must land), and a **transition**.
Full read ≈ 19 minutes.

**How to use**
- **Full briefing (~19 min):** every slide.
- **NGO / donor short pitch (~7 min):** slides **1, 2, 3, 5, 14, 16, 21, 22, 25, 26**
  — story, architecture, a capture screen, the locked vault, the audit log, the
  humanitarian deployment story (twocol + the deployment/export shots), status, close.
  (Marked ⏩.)
- **Live-demo variant:** every screenshot slide can be driven in the running PWA — the
  deck mirrors the real UI. Demo clicks noted under **demo**.
- Keep the honesty discipline: a *documentation & coordination tool* — not a medical
  device, not certified.

---

## 1 · Title — TRIAGE-LINK ⏩
**say:** "TRIAGE-LINK is an offline-first progressive web app for documenting and
coordinating casualties in the field. This is the Humanitarian / NGO cut — the same
offline core, tuned for multi-team deployments where the cloud isn't: disaster and MCI
response, field clinics, mass-gatherings."
**points:** offline-FIRST · built for no-infrastructure settings.
**transition:** "Start with the problem it's built around."

## 2 · Positioning — One field record, no signal required ⏩
**say:** "You document a casualty *completely offline* — injuries, vitals, treatments,
photos, triage, handover — with no server in the loop. It installs like an app, stores
everything locally, and survives reloads, crashes and power cycles. In a camp or a
disaster zone, the record exists on the device the moment care happens, and reconciles
across the team only if and when you have connectivity."
**points:** data survives · sync is optional and additive.
**transition:** "That's credible because of the architecture."

## 3 · Architecture — Offline-first core, optional everything else ⏩
**say:** "Three tiers. The **device PWA** is the whole product on its own. The **sync
service** is optional and server-side — multi-tenant, with per-tenant quota and retention.
The **EHR gateway** is optional too. For a humanitarian deployment the headline is the
left box: fully functional with neither optional tier present, and an air-gapped Docker
stack if you want sync on a single offline laptop."
**points:** field path never depends on the cloud · air-gap option.
**transition:** "Inside the device — capture first."

## 4 · PWA · Capture — Documenting a casualty
**say:** "Capture is built for gloves and speed: mark injuries on an anatomical body chart,
anterior and posterior; pick type and severity; add notes and wound photos; burn TBSA
auto-estimated by Lund–Browder for the age band. Identity and incident sit alongside, and a
START-style triage tag drives the colour-coded board — exactly what mass-casualty triage
needs."
**transition:** "Here's that one screen."

## 5 · PWA · Screenshot — The field record ⏩
**demo:** open the app; the record screen is the landing view.
**say:** "One screen, fully offline — triage tag, identity, incident, the injury
body-chart, an acuity glance with GCS and TBSA, and vitals, all on-device with no network
call."
**transition:** "Beyond the snapshot, the clinical detail."

## 6 · PWA · Clinical — Vitals, interventions & trends
**say:** "Timestamped vital sets — HR, BP, RR, SpO₂, GCS, pain — with a built-in GCS
calculator. Two readings and trend sparklines appear; a time-since-injury clock runs.
Treatments are a structured, timestamped log, each attributed to the on-duty operator and
feeding the AT-MIST handover."
**transition:** "Which brings us to the handoff."

## 7 · PWA · Handover — Summaries & clean handoff
**say:** "A one-page AT-MIST casualty card to print or save as PDF for the receiving team,
and a scene roll-up for command — casualties tallied by triage, on-scene versus
handed-over. Sign-off emits a FHIR handover bundle. Nothing leaves the device unless you
export or sync."
**transition:** "Both, from the app."

## 8 · PWA · Screenshot — Handover card & the scene picture
**demo:** open **Summary** and **Board**.
**say:** "The printable AT-MIST card, and the Triage Board — every casualty by acuity,
searchable, filterable by on-scene versus handed-over: the command picture from the same
offline records."
**transition:** "Who can use it, and in what language."

## 9 · PWA · Accessibility — Four languages, guided & spoken
**say:** "English, French, Arabic and Persian built in, with full RTL for Arabic and
Persian — and loadable JSON language packs add a language with *no app release*, which is
exactly what you need when you deploy into a new region. Parity is CI-enforced, and every
user-visible feature is taught by a guided, spoken tour."
**points:** language packs need no release · RTL is real.
**transition:** "Here's the tour running."

## 10 · PWA · Screenshot — The guided tour *(new)*
**demo:** click **❔ Tour**; advance to the body-chart step.
**say:** "A 15-step smart tour spotlights each real control and narrates it offline in the
active language — now covering operators, the vault, backup and restore, and language packs.
Action steps auto-advance: dropping a marker moves the tour on by itself. For rotating
volunteer staff, that's self-serve onboarding with no trainer on site."
**transition:** "Underneath is durable, offline storage."

## 11 · PWA · Platform — Installable, offline, durable
**say:** "Installs as a PWA with a service worker, so it launches and runs with no network.
All data in IndexedDB — records, op-log, photos, audit chain. Phones, tablets, laptops. No
telemetry, no implicit network calls."
**transition:** "When you connect several devices, the data reconciles — the sync engine."

## 12 · Data integrity — Conflict-aware op-log sync engine
**say:** "Every change is journaled as an immutable operation, not a blind overwrite. A
deterministic resolve orders edits by Lamport clocks; ties break predictably, so every
device converges. Concurrent edits to different fields all survive; same-field edits pick a
deterministic winner and *report* the conflict. Critical when several responders touch the
same casualty on different tablets."
**transition:** "Now data at rest."

## 13 · Security · At rest — Opt-in encryption vault
**say:** "An opt-in vault encrypts wound photos, records and the op-log with AES-256-GCM,
key derived from a passphrase via PBKDF2 at 210,000 iterations. The key lives only in
memory while unlocked; idle devices auto-lock. Default-off — and in disaster/MCI mode this
flavor makes it *mandatory*."
**transition:** "Here's a locked device."

## 14 · Security · Screenshot — Locked ⏩ *(new)*
**demo:** ⋯ menu → **Encrypt data**, then **Lock now**.
**say:** "On and idle, the device auto-locks to this screen. Records, op-log and photos are
encrypted at rest, unreadable until the passphrase is re-entered — which never leaves
memory. A lost or confiscated field tablet is just ciphertext: a concrete protection for
vulnerable populations' data."
**transition:** "Access control and accountability are the other half."

## 15 · Security · Access — Operators, RBAC-lite & tamper-evident audit
**say:** "A local operator roster — field, lead, admin. Records and audit entries are
attributed to whoever's on duty, and a step-up PIN gates sensitive actions. The audit log
is append-only and hash-chained with SHA-256 — tampering breaks the chain and is detectable
offline. On a shared clinic tablet, that's accountability without a server."
**transition:** "Both, from the app."

## 16 · Security · Screenshot — Operators & the hash-chained log ⏩ *(new)*
**demo:** ⋯ menu → **Operators**; then **Audit log** → **Verify chain**.
**say:** "The operator roster with the PIN-gated actions spelled out; and the audit log —
time, event, case, device per entry — with a 'Verify chain' button that recomputes the hash
chain to prove nothing was altered. Donors and partners increasingly ask for exactly this
kind of provable data integrity."
**transition:** "Getting data in and out matters as much as protecting it."

## 17 · Data portability — Backup, restore & export
**say:** "Full JSON backup — plain or passphrase-encrypted — and restore by merge or
replace, ideal for low-infrastructure handoff on a USB stick. Plus CSV: a donor-ready
roster export with deployment provenance, import from paper, and a date-range scope."
**transition:** "Optionally, a backend."

## 18 · Hosted backend — Multi-tenant sync service
**say:** "An optional Fastify + PostgreSQL backend for cross-team aggregation — never
required, and runnable air-gapped. Each API key authenticates and scopes a tenant's data;
the conflict-aware /sync folds the same ops. Hardened with per-tenant quota and
audit-retention TTL."
**transition:** "Administered securely."

## 19 · Hosted backend · Admin — Admin security & console
**say:** "The tenant-admin API sits behind a static token or OIDC SSO, audience-checked,
with optional role mapping. Admins provision tenants and rotate keys; every admin mutation
hits a separate admin-audit trail. An opt-in console holds no secrets and is off by
default."
**transition:** "One core, productised three ways."

## 20 · Section — Three market flavors ⏩
**say:** "The same offline core ships as three flavors — Humanitarian / NGO, Ontario EMS as
the regulated line, and the productised backend they share. This deck is the humanitarian
cut, so let's spend our time there."
**transition:** "Here's what this line ships."

## 21 · Flavor · Humanitarian / NGO — Field documentation where the cloud isn't ⏩
**say:** "On this line: a device-wide deployment tag with a provenance banner so every
record carries where it came from; a disaster/MCI mode that with one toggle makes
encryption mandatory and adds a command roll-up; kiosk defaults — an assign-operator prompt
and a two-minute auto-lock on shared devices; a donor-ready, provenance-stamped CSV with a
date-range filter; retention presets — a confirmed, step-up-gated purge window; and
air-gapped packaging — one Docker stack, PWA plus sync plus Postgres, running offline on a
laptop. Intended use is documentation and coordination — a deliberately light regulatory
load."
**points:** MCI toggle · retention · air-gap · provenance · light reg posture.
**transition:** "Here's the deployment and donor-export tooling in the app."

## 22 · Flavor · Humanitarian — screenshots ⏩
**demo:** show the **deployment bar**; then ⋯/Saved → the **export & retention** controls.
**say:** "On the left, the deployment context — tag the operation, response type and
organisation, with MCI mode for shared devices. On the right, the donor export — a
date-range CSV with provenance, alongside the retention window, here set to 'Keep all'.
That's the operational layer humanitarian coordinators actually live in."
**points:** provenance everywhere · donor-ready export · retention control.
**transition:** "The regulated sibling, briefly, for contrast."

## 23 · Flavor · Ontario EMS (regulated) — Toward a conformant ePCR
**say:** "The Ontario line points the same core at a regulated ePCR — NEMSIS v3.5 / OADS
v4.0 shaping, an in-app conformance pre-check, and a server-side ONE ID gateway. It's a
useful contrast: same capture core, much heavier conformance and integration scaffolding.
For a humanitarian buyer it signals headroom — the platform can grow into regulated
settings."
**transition:** "Both lines stand on a shared spine."

## 24 · Flavor · Productized backend — The shared, hardened service line
**say:** "The multi-tenant sync service and admin security is the common spine both branches
reuse — isolation, OIDC SSO, per-tenant limits and quota, incremental sync, and the audit
trails a multi-service deployment needs. A hardening fix lands once and cascades to every
flavor."
**transition:** "So where does the humanitarian line stand?"

## 25 · Status — Where things stand ⏩
**say:** "Done and merged: the full offline PWA; the vault, operators, step-up and
tamper-evident audit; the multi-tenant backend and console; and all five humanitarian
roadmap items — deployment context, MCI mode, donor export, retention presets, and
air-gapped packaging. The Ontario regulated work continues in parallel. What's next on this
line is mostly partnerships and field pilots rather than external gates."
**points:** the humanitarian roadmap is shipped end-to-end.
**transition:** "To close —"

## 26 · Closing — Document anywhere. ⏩
**say:** "Document anywhere. Offline-first by design, encrypted and audited, deployable
air-gapped, and ready for the cloud only when you want it. One PWA, an optional multi-tenant
backend, and a humanitarian line built for the multi-team deployment. Happy to go deep on
any of it — or open the running app and drive it live."

---

### Quick-reference timing

| Segment | Slides | ~min |
|---|---|---|
| Story & architecture | 1–3 | 3 |
| The PWA (capture → tour) | 4–11 | 7 |
| Sync & security | 12–17 | 5 |
| Backend & admin | 18–19 | 2 |
| Flavors (humanitarian focus) | 20–24 | 4 |
| Status & close | 25–26 | 2 |

### Do-not-say list
- "Medical device" / "certified" / "compliant" — this line is a *documentation &
  coordination tool* with a deliberately light regulatory posture.
- "Always syncs" / "needs a server" — sync is *optional* and runs *air-gapped*; the
  field path never depends on the cloud.
