# TRIAGE-LINK — Commercialization & Go-to-Market Strategy

> **Purpose.** A practical plan to take TRIAGE-LINK from a working prototype to a **commercial product**, with a clear beachhead, business model, productization plan, and phased roadmap. It complements two existing docs: `docs/canada-market-survey.md` (the competitive/regulatory landscape) and `docs/CERTIFICATION-ROADMAP.md` (the medical-device pathway). This doc is the **business** layer those two imply.
>
> ⚠️ **Not legal, financial, or regulatory advice.** Engage a regulatory-affairs professional, a privacy/health-law advisor, and a sales/commercial lead before committing. Figures are planning estimates, not quotes.

*Prepared 2026-06-27.*

---

## 1. Executive summary

TRIAGE-LINK is an **offline-first, no-backend PWA** that uniquely combines **prehospital ePCR + MCI/START triage + FHIR R4 handover**, multilingual (EN/FR/AR/FA incl. RTL). The Canadian market survey shows the **official provincial/municipal EMS ePCR market is a fortress** — mandatory Ontario OADS v4.0 compliance, entrenched cloud incumbents (ESO/Interdev-iMedic, ESO/Medusa-Siren, ImageTrend), multi-year RFP cycles — and even the displaced Prehos customers are migrating to *other cloud incumbents*, not offline-first tools.

**Recommendation: do not fight that fortress first.** Enter through an **underserved beachhead** where TRIAGE-LINK's exact strengths are decisive and the regulatory burden is lighter — **humanitarian / NGO / global-health and disaster / MCI / event medicine**. Frame the product as a **documentation & coordination tool** (not clinical-decision SaMD) to stay on the lighter regulatory path, land **2–3 reference deployments**, build evidence and revenue, and only take on the full **SaMD + OADS/NEMSIS** burden when expanding toward the formal EMS channel.

**The wedge in one line:** *the only field casualty tool that runs with zero connectivity and zero server, speaks four languages including RTL, and does triage + charting + standards-based handover in one installable app — at a fraction of the per-seat cost of cloud ePCR.*

---

## 2. What we have to sell (assets & differentiation)

**Product assets (built today):**
- Offline-first PWA — installable, works fully offline, deploys as static files (no backend required).
- Capability breadth in one app: anatomical **body-chart injury capture**, timestamped **vitals** (+GCS) with **trend sparklines**, **treatments**, **START triage** + multi-casualty **triage board**, **time-since-injury** clocks, **incident-command scene summary**, **AT-MIST casualty card**, **FHIR R4** export (Patient + Encounter + Provenance).
- **Multilingual EN/FR/AR/FA** with full **RTL** — rare in this category.
- **At-rest encryption vault** (AES-256-GCM) + encrypted backups; security-hardened (CSP, API hardening, CI scanning).
- Clean, framework-free domain core (`@triage-link/core`) reusable by future native/back-end clients.

**Differentiation vs the surveyed Canadian field:**

| Capability | TRIAGE-LINK | ESO/Interdev (iMedic) | ESO/Medusa (Siren) | ImageTrend |
|---|:--:|:--:|:--:|:--:|
| ePCR | ✅ | ✅ | ✅ deep | ✅ deep |
| MCI/START triage + board | ✅ | not advertised | not advertised | not advertised |
| FHIR R4 handover | ✅ named | generic only | not advertised | ✅ (Hub) |
| **No backend / no sync server** | ✅ | ❌ cloud | ◐ store-and-sync | ❌ SaaS |
| Multilingual + **RTL** | ✅ | not advertised | not advertised | not advertised |
| Zero per-seat infrastructure | ✅ | ❌ | ❌ | ❌ |
| **Provincial-standard (OADS/NEMSIS) compliance** | ❌ *(gap)* | ✅ | ✅ | ✅ |
| CAD/dispatch + EHR integration | ❌ *(gap)* | ✅ | ✅ | ✅ |
| Mature ePCR depth, billing, analytics | ❌ *(gap)* | ✅ | ✅ | ✅ |

*Read:* we win on **portability, breadth-in-one-app, language, and cost**; incumbents win on **depth, integration, and compliance**. The strategy is to sell into contexts where the first column matters more than the last three rows.

---

## 3. Strategic thesis

1. **The official-EMS lane is the hardest possible first market.** It requires OADS/NEMSIS compliance, CAD/EHR integration, an ISO 13485 QMS, and survives only through multi-year procurement against incumbents with reference bases. That's a capital-heavy, slow fight to *match* incumbents on *their* strengths.
2. **Our strengths are someone else's unmet needs.** Offline/no-infrastructure, multilingual-RTL, and combined MCI+ePCR are exactly what humanitarian, disaster, austere, and event-medicine contexts need — and what cloud ePCRs are *bad* at.
3. **Lighter regulatory path is available** if intended use is framed as **documentation/coordination**, not clinical decision-making (see `CERTIFICATION-ROADMAP.md` §1). That collapses time-to-first-revenue from years to months.
4. **Land-and-expand:** prove value + safety + references in the niche, then climb toward regulated/EMS markets with a product that already has users, evidence, and revenue behind it.

---

## 4. Target segments & beachhead

Scored on fit (does our differentiation win?), accessibility (can a small team reach buyers?), regulatory burden, and willingness to pay.

| Segment | Differentiation fit | Accessibility | Reg. burden | Verdict |
|---|:--:|:--:|:--:|:--:|
| **Humanitarian / NGO / global health** | ★★★ | ★★ | ★ (light) | **Primary beachhead** |
| **Disaster / MCI & event medicine** | ★★★ | ★★★ | ★★ | **Primary beachhead** |
| Remote-industrial / expedition / maritime | ★★ | ★★ | ★★ | Secondary |
| Training & simulation (paramedic schools) | ★★ | ★★★ | ★ (light) | Early-traction wedge |
| Official EMS (provincial/municipal) | ★ | ★ | ★★★ (heavy) | Phase 3 expansion |

**Beachhead = Humanitarian/NGO/global-health + Disaster/MCI/event medicine.** They share the same buyer pains and the same product fit, so one product configuration serves both.

- **Why they fit:** intermittent or absent connectivity; multilingual incl. Arabic/Persian populations; multi-casualty scenes; no IT infrastructure to deploy a server; tight budgets; need a printable/shareable handover artifact.
- **Who buys:** international NGOs and their field medical programs, national Red Cross/Red Crescent societies, disaster-response and emergency-management agencies, event-medical providers (festivals/sports/marathons), and global-health implementers. (Defence/TCCC is adjacent but out of this plan's scope.)
- **Training/simulation** is a fast, low-risk way to seed reference users and clinical champions while the field deployments mature.

---

## 5. Positioning & value proposition

**Positioning statement:** *For field medical teams working where connectivity, infrastructure, and language can't be assumed, TRIAGE-LINK is the install-anywhere casualty-documentation and triage app that captures, triages, and hands over patient care in one offline tool — unlike cloud ePCR platforms that need servers, single-language UIs, and per-seat contracts.*

**Value pillars:**
1. **Works when nothing else does** — zero connectivity, zero server, installs on any device.
2. **One tool, whole workflow** — triage board + charting + FHIR handover + scene summary.
3. **Speaks your patients' language** — EN/FR/AR/FA with RTL, extensible.
4. **Owns its data** — on-device, encrypted, exportable; no vendor lock-in or cloud-continuity risk (cf. the Prehos collapse).
5. **Radically lower cost** — no per-seat cloud bill; deploy to a whole team for a fraction of a ~$60K/yr ePCR contract.

---

## 6. Business model & pricing

**Licensing decision (do this first):** the repo is **MIT** today. For a commercial product, move to an **open-core / dual-license** posture: keep a free community core (drives humanitarian goodwill, adoption, and trust), and gate **commercial value-adds** (multi-tenant admin, SSO/RBAC, audit/compliance pack, support SLA, integrations, hosted sync) behind paid tiers. *Decide before external contributions and customer deployments accrue.*

**Tiering (illustrative):**

| Tier | Audience | What's included | Model |
|---|---|---|---|
| **Community** | Solo/NGO/training | Full offline PWA, self-hosted static deploy | Free / open-source |
| **Team** | Event/NGO programs | Multi-device admin, training, priority support, branded builds | Annual subscription per org/site |
| **Organization** | Larger NGOs/agencies | SSO/RBAC, audit log, optional hosted sync, data-residency options, onboarding | Annual; volume tiers |
| **Enterprise / EMS** | Formal EMS (Phase 3) | OADS/NEMSIS conformance, CAD/EHR integration, certified SaMD, QMS docs, SLA | Contract / RFP |

**Pricing strategy:** lead with **cost disruption**. The no-backend architecture removes the per-seat cloud cost that anchors incumbents (~$63K/yr at a mid-size service). Price the **Team/Org** tiers as a **site/program licence + support**, not per-seat, so a 50-person event team or NGO field program is dramatically cheaper than cloud ePCR. For humanitarian buyers, expect **grant-funded** or **free-core + paid-support/services** revenue rather than SaaS seats.

**Revenue logic:** services and support (deployment, training, custom languages, integration, compliance evidence) will likely out-earn licences in the niche phase — and they build the references and case studies that unlock the bigger markets later.

---

## 7. Regulatory & compliance posture (beachhead)

- **Intended use = documentation & coordination tool**, explicitly *not* a clinical-decision SaMD (see `CERTIFICATION-ROADMAP.md` §1). Write the **Intended Use / Indications** statement to match, and make sure computed outputs (TBSA, START category) are presented as **user-entered/clinician-confirmed records**, not guidance. This keeps the beachhead on the **light regulatory path**.
- **Privacy & data protection (must-have to handle real PHI):** even as a documentation tool, you handle PHI. Establish: a privacy policy + DPA, **data-residency** options, breach-notification process, and alignment with **PHIPA/PIPEDA** (Canada) and **GDPR** (if EU/EEA data) — and note humanitarian deployments add their own data-protection norms (e.g., ICRC data-protection standards).
- **Security productization:** flip the encryption vault from opt-in to **always-on by policy** for org tiers; add **RBAC, SSO, immutable audit log**, retention/destruction. Pursue **SOC 2 Type II** + an independent **pen test** when org/enterprise deals require it.
- **Defer the heavy stack** (ISO 13485 QMS, IEC 62304/62366/14971 full evidence, OADS/NEMSIS conformance, Health Canada/FDA submission) to **Phase 3**, when chasing regulated/EMS revenue — per the cert roadmap's phased plan.

---

## 8. Productization gaps (prototype → commercial-ready)

**Must-have for the beachhead (Phase 1):**
- **Accounts & multi-tenant org management** (today it's single-device).
- **Always-on encryption policy**, **RBAC**, **SSO** (org tier), **immutable audit log**.
- **Optional hosted sync** (productionize `packages/sync-service`: auth, multi-tenant, DR/backup, observability) — *optional*, because offline-only must remain first-class.
- **Admin & reporting** (export, roster, basic analytics), **data import/export/migration**.
- **Accessibility (WCAG)**, **device/MDM** guidance, **app-store/installable** distribution polish.
- **Onboarding, training material, and support** processes + documentation.
- **Language extensibility** (add a language without a code release) — a direct selling point.

**Later (Phase 2–3):** OADS/NEMSIS dataset conformance, CAD/dispatch + hospital-EHR integration, billing, deep analytics, certified-SaMD evidence.

> Engineering note: keep **offline-first and no-backend as the default**. Every paid feature (sync, SSO, audit) must degrade gracefully to the offline core — that's the moat, not a checkbox.

---

## 9. Go-to-market motion

1. **Design-partner pilots (2–3).** Recruit a national Red Cross/Red Crescent program, a disaster-response/emergency-management agency, and an event-medical provider. Offer free/subsidized deployment + hands-on support in exchange for feedback, a reference, and a case study.
2. **Land via champions, not RFPs.** In the niche, adoption is clinician/coordinator-led, not procurement-led. Win a field medical lead or event medical director; let usage spread.
3. **Evidence flywheel.** Each pilot → usage data + a published case study + (ideally) a small field/simulation study (cf. the KatApp result that app-triage beats paper). Evidence de-risks the next sale and seeds the eventual SaMD clinical file.
4. **Partnerships:** humanitarian tech consortia, FHIR/interop communities, training organizations, and device makers — channels that reach the buyers a small team can't cold-call.
5. **Content & community:** open-source core + visible roadmap builds trust in a sector that distrusts vendor lock-in (Prehos is the cautionary tale to reference).

---

## 10. Phased commercial roadmap

| Phase | Goal | Key work | Exit criteria |
|---|---|---|---|
| **0 — Validate (0–3 mo)** | Confirm demand & intended-use | Intended-use statement; 8–12 buyer interviews; licensing decision (open-core); privacy posture; pick 2–3 design partners | Signed design partners; go/no-go |
| **1 — Beachhead pilots (3–9 mo)** | First real deployments | Phase-1 productization (accounts, RBAC, audit, always-on crypto, support); deploy + support pilots; collect evidence | 2–3 live deployments; 1 case study; first paid support/licence |
| **2 — Scale the niche (9–24 mo)** | Repeatable revenue in niche | Org tier + optional hosted sync; partnerships; pricing/packaging; SOC 2 if needed; small field/sim study | Repeatable sales motion; reference base; sustainable revenue |
| **3 — Regulated expansion (24 mo+)** | Enter EMS / regulated markets | SaMD path (ISO 13485, IEC 62304/62366/14971), OADS/NEMSIS conformance, CAD/EHR integration, Health Canada/FDA | Certified product; first official EMS contract |

---

## 11. Team, org & funding

- **Founding gaps to fill:** **regulatory/quality** lead (fractional at first), a **clinical lead/advisor** (paramedic/EM physician) for credibility + the advisory board, and **sales/BD** for the niche. Engineering exists; these don't.
- **Company & risk:** incorporate; obtain **product/professional liability insurance** appropriate to medical software; vulnerability-disclosure policy.
- **Funding fit:** the niche-first path suits **non-dilutive funding** — health-innovation grants, humanitarian-tech funds, global-health/disaster-resilience programs, and government innovation programs — better than VC. Reserve VC/large raises for Phase 3 (regulated expansion), where capital intensity justifies it.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Intended-use creep into SaMD** (TBSA/START presented as guidance) triggers heavy regulation prematurely | Lock the documentation-tool intended-use; present computed values as confirmable records; legal review |
| **PHI/privacy exposure** in a security-sensitive sector | Always-on encryption, audit log, data residency, DPA, breach process before any real-PHI pilot |
| **No clinical evidence / references yet** | Design-partner pilots + a small field/simulation study early; publish |
| **Open-source core cannibalizes revenue** | Open-core boundary drawn at org/compliance/support features; services-led revenue in niche |
| **Niche is small / low willingness-to-pay** | Services + grants + multi-segment (NGO+disaster+events+training) to aggregate demand; niche is the wedge, not the ceiling |
| **Incumbents add offline/multilingual** | Move fast on references; the combined no-backend + RTL + MCI set is hard to retrofit onto cloud SaaS |
| **Solo-vendor trust concern** (cf. Prehos) | Open-source core + data-ownership story turns the sector's fear into our advantage |

---

## 13. What success looks like (KPIs by phase)

- **Phase 0:** ≥3 signed design partners; documented intended-use + licensing decision.
- **Phase 1:** 2–3 live field deployments; 1 published case study; first revenue (support/licence); zero PHI incidents.
- **Phase 2:** repeatable sales motion; named reference customers across ≥2 sub-segments; 1 field/simulation study; positive gross margin on services + licences.
- **Phase 3:** certified product; first official EMS/regulated contract.

---

## 14. Immediate next steps (30 / 60 / 90 days)

- **30 days:** draft the **Intended Use / Indications** statement; make the **open-core licensing** decision; write a one-page **privacy & data-protection posture**; build a target list of 15–20 design-partner candidates.
- **60 days:** 8–12 **buyer-discovery interviews**; sign **2–3 design partners**; scope **Phase-1 productization** backlog (accounts, RBAC, audit, always-on crypto, support).
- **90 days:** begin Phase-1 build; stand up support/onboarding; line up a **clinical advisor**; identify 1–2 **non-dilutive funding** programs to apply to.

---

## Appendix — sources & cross-references
- Competitive & regulatory landscape: **`docs/canada-market-survey.md`** (incl. the OADS v4.0 compliance moat, ESO/Interdev/Medusa/ImageTrend footprints, and the Prehos collapse).
- Medical-device pathway & standards stack: **`docs/CERTIFICATION-ROADMAP.md`** (intended-use decision, ISO 13485 / IEC 62304 / 62366 / 14971 / 81001-5-1, phased certification, indicative cost & timeline).
- Engineering build plan: **`docs/ROADMAP.md`**.

*This is a working strategy, not a commitment or forecast. Validate every assumption with real buyer discovery before investing.*
