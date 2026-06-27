# TRIAGE-LINK — Productization Gap Backlog (Prototype → Commercial Product)

> **Purpose.** The concrete engineering work to turn the prototype into a sellable product, **sized** and **sequenced**, with the **commercial tier** each gap unlocks. Pairs with `docs/commercialization-strategy.md` (which tier/segment needs what) and `docs/CERTIFICATION-ROADMAP.md` (the regulated-market evidence). One of three exploration deliverables — read alongside the strategy and the regulatory brief before deciding.
>
> *Sizing:* **S** ≈ days · **M** ≈ 1–2 wks · **L** ≈ 3–6 wks · **XL** ≈ quarter+. *Phase* maps to the strategy's commercial roadmap (P1 beachhead → P2 scale niche → P3 regulated/EMS).
>
> **North star constraint:** offline-first and **no-backend stays the default**. Every paid/online feature must **degrade gracefully** to the offline core — that's the moat, not a checkbox.

*Prepared 2026-06-27.*

---

## Where the prototype stands today
Built: offline PWA, IndexedDB store + op-log, body chart, vitals/trends, START triage board, scene summary, AT-MIST card, FHIR R4 export, EN/FR/AR/FA (RTL), opt-in at-rest vault + encrypted backups, CSP/API hardening, CI scanning. **Single-device, single-user, no accounts, no server required.**

The gaps below are what stands between that and "a customer's IT/clinical/procurement team says yes."

---

## 1. Identity & access
| Gap | Why it's needed | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| User accounts + sign-in | Attribute records to a clinician; baseline for audit | M | P1 | Team |
| Multi-tenant org model | Separate data per NGO/agency/event; admin boundaries | L | P1 | Team/Org |
| Role-based access control (RBAC) | Field / lead / admin scopes; least privilege | M | P1 | Org |
| SSO (OIDC/SAML) | Enterprise/agency procurement requirement | L | P2 | Org/Enterprise |
| Device provisioning / enrolment | Hand out configured installs to a field team | M | P2 | Org |

## 2. Security & compliance hardening
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| **Always-on encryption policy** (org-enforced, not opt-in) | Real-PHI handling; remove the "off by default" risk | M | P1 | Org |
| Key management & recovery (org escrow / rotation) | Avoid lost-passphrase data loss at org scale | L | P1 | Org |
| **Immutable audit log** (who-saw/changed-what) | PHIPA/HIPAA-grade accountability; procurement gate | L | P1 | Org/EMS |
| Retention & destruction policy + tooling | Health-privacy compliance | M | P2 | Org |
| SOC 2 Type II readiness | Enterprise/government trust | XL | P2 | Enterprise |
| Independent pen test + vuln-disclosure program | Sector expectation; de-risks deals | M | P2 | Org/Enterprise |

## 3. Data, sync & reliability
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| Productionize `sync-service` (auth, multi-tenant, rate limits) | Optional shared/team data without losing offline-first | XL | P2 | Org (optional) |
| Conflict-resolution hardening at scale | Op-log resolver proven beyond single device | L | P2 | Org |
| Backup / disaster recovery (hosted tier) | Uptime & data-durability guarantees | L | P2 | Org/Enterprise |
| Observability (logging, metrics, error reporting) | Operate a service; support SLAs | M | P2 | Org |
| Uptime SLA + status page | Contractual requirement for hosted tiers | S | P2 | Org/Enterprise |

## 4. Interoperability & data standards
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| FHIR conformance hardening (CA-Core / profiles, validation) | Credible standards-based handover | L | P2 | Org/EMS |
| **OADS v4.0 dataset conformance** | *Mandatory* for official Ontario ACR use | XL | P3 | EMS |
| **NEMSIS** dataset/export | US + national EMS data flows | XL | P3 | EMS (US) |
| CAD / dispatch integration | Incumbent-parity feature for EMS | XL | P3 | EMS |
| Hospital EHR exchange (Epic/Oracle/etc.) | Closes the handover loop for EMS | XL | P3 | EMS |

## 5. Admin, ops & monetization
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| Org admin console (users, roles, settings) | Self-serve management | L | P1 | Org |
| Reporting / analytics (roster, exports, basics) | Coordinator/QA value | M | P2 | Org |
| Data import / export / migration | Avoid lock-in fear; onboard from paper/other tools | M | P1 | Team/Org |
| Licensing / entitlement enforcement | Gate paid tiers (open-core boundary) | M | P1 | Team/Org |
| Billing / subscription management | Collect revenue | M | P2 | Team/Org |

## 6. UX, accessibility & distribution
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| Accessibility (WCAG) pass | Procurement + field usability (gloves/sunlight) | M | P1 | All |
| Language extensibility (add a language w/o code release) | Direct selling point for multilingual buyers | M | P1 | All |
| White-label / branded builds | NGO/agency branding | S | P1 | Team/Org |
| MDM / managed-device guidance + packaging | Fleet deployment | M | P2 | Org |
| Install/distribution polish (stores, kiosk, signed builds) | Trust + ease of rollout | M | P1 | All |

## 7. Support & documentation (product, not code)
| Gap | Why | Size | Phase | Unlocks |
|---|---|:--:|:--:|---|
| Onboarding + training material | Adoption in non-technical field teams | M | P1 | All |
| Support process + SLA tiers | Required for paid tiers | M | P1 | Team/Org |
| Admin/clinical docs + runbooks | Reduce support load; procurement evidence | M | P1 | All |

---

## Phase rollup (what "done" means)
- **P1 — beachhead-ready:** accounts, multi-tenant, RBAC, always-on crypto + key recovery, immutable audit, import/export, entitlements, accessibility, language extensibility, onboarding/support. *This is the minimum to deploy real PHI for a paying NGO/event customer.*
- **P2 — scale the niche:** SSO, hosted sync + DR + observability + SLA, reporting, billing, SOC 2, pen test, FHIR conformance.
- **P3 — regulated/EMS:** OADS/NEMSIS conformance, CAD/EHR integration, plus the SaMD evidence stack in the cert roadmap.

## Biggest, riskiest items (watch these)
1. **Multi-tenant + hosted sync** (XL) — the architectural shift from single-device; do it without compromising offline-first.
2. **OADS/NEMSIS conformance** (XL each) — the procurement moat; only worth it for the EMS channel (P3).
3. **SOC 2** (XL, mostly process) — long lead time; start early if enterprise/gov is targeted.

> **Sequencing principle:** P1 is small and segment-driven — you do *not* need the XL items to earn first revenue in the humanitarian/event niche. Defer every P3 item until the EMS channel is a deliberate, funded decision.
