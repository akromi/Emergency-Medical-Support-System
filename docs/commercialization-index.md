# TRIAGE-LINK — Commercialization: Options & Decision Guide

> **Read this first.** You wanted to explore *all* the options before committing. This page is the map: the deliverables now in the repo, the real decisions in front of you, and how the documents inform each. Nothing here locks you in — it's built to help you choose.

*Prepared 2026-06-27.*

---

## The documents (the exploration set)

| Doc | Answers | Read it when deciding… |
|---|---|---|
| **`commercialization-strategy.md`** | Who buys, how to win, business model/pricing, phased commercial roadmap; scores **all four beachheads** (§4) | …**which market** and **how to make money** |
| **`productization-gap-backlog.md`** | The engineering prototype→product gaps, **sized & sequenced**, with the tier each unlocks | …**what it costs to build** and **in what order** |
| **`regulatory-privacy-brief.md`** | Medical-device vs documentation-tool decision; PHIPA/PIPEDA/residency; security controls | …**how heavy the compliance load** is for each path |
| `canada-market-survey.md` | The competitive landscape + regulatory moat (background) | …**who you're up against** |
| `CERTIFICATION-ROADMAP.md` | The full SaMD certification path (background) | …**the regulated-market endgame** |

---

## The three decisions that drive everything

### Decision A — Intended use *(regulatory brief)*
**Documentation/coordination tool** (light, months to revenue) **vs SaMD** (heavy, 12–24+ months). Everything downstream traces to this. *Recommended for a first move: documentation tool.*

### Decision B — Beachhead market *(strategy §4)*
| Option | Fit with our strengths | Accessibility | Reg. load | Revenue horizon |
|---|:--:|:--:|:--:|:--:|
| **Humanitarian / NGO / global health** | ★★★ | ★★ | light | months |
| **Disaster / MCI & event medicine** | ★★★ | ★★★ | light–med | months |
| Training / simulation (entry wedge) | ★★ | ★★★ | lightest | months |
| **Official EMS (provincial/municipal)** | ★ | ★ | heavy | 12–24+ months |

*Trade-off in one line:* the niche segments **fit our differentiation and are reachable fast**; official EMS is **the biggest prize but a fortress** (OADS moat, entrenched cloud incumbents, the Prehos refugees still choosing cloud).

### Decision C — Licensing posture *(strategy §6)*
Repo is **MIT** today. A commercial product usually moves to **open-core / dual-license** (free core, paid org/compliance/support features). Decide before customer deployments and external contributions accrue.

---

## How the options combine (illustrative paths)

| Path | Intended use | Beachhead | Build load | When to revisit regulation |
|---|---|---|---|---|
| **A. Niche-first** *(recommended)* | Documentation tool | Humanitarian + disaster/event | P1 only (no XL items) | Phase 3, if/when chasing EMS |
| **B. Training wedge** | Documentation tool | Training/simulation → niche | Smallest P1 | Later |
| **C. EMS frontal** | SaMD | Official provincial/municipal EMS | P1+P2+P3 (incl. OADS/NEMSIS, SaMD) | Now — it's the whole point |
| **D. Hybrid** | Tool now, SaMD later | Niche now, EMS later | P1 now; P3 deferred | Staged |

---

## What I'd recommend (you can override)
**Path A / D — niche-first, documentation tool, open-core**, anchored on humanitarian + disaster/event, with EMS as a deliberate Phase-3 expansion. It matches the product's actual edge, reaches revenue in months, and keeps the expensive regulated work optional until there's proof and funding. The full case is in `commercialization-strategy.md`.

But the docs are written so you can also justify **Path C** (go straight at EMS) if you have the capital, regulatory appetite, and a multi-year horizon — the survey and cert roadmap lay out exactly what that costs.

---

## Once you've chosen — next steps
- **Picked a beachhead?** → I can deep-dive a single-segment GTM plan (buyer personas, pilot targets, pricing, outreach).
- **Picked the engineering path?** → I can turn the gap backlog into a sequenced, estimated delivery plan (or start building P1 items).
- **Going for EMS/regulated?** → I can expand the cert roadmap into an actionable QMS + OADS/NEMSIS conformance plan.
- **Still weighing it?** → tell me which two paths you're torn between and I'll do a focused head-to-head.
