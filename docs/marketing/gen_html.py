#!/usr/bin/env python3
"""Emit a self-contained, brand-themed HTML slide deck for TRIAGE-LINK."""
import html, pathlib, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "triage-link-overview.html")

def esc(s): return html.escape(s)

slides = []

def title_slide(big, sub, note):
    slides.append(f'''<section class="slide title">
      <div class="rule"></div>
      <h1>{esc(big)}</h1>
      <p class="lede">{esc(sub)}</p>
      <p class="note">{esc(note)}</p>
      <p class="stack">React + TypeScript · IndexedDB + op-log · WebCrypto · Fastify · NEMSIS/OADS</p>
    </section>''')

def section_slide(kicker, big, sub):
    slides.append(f'''<section class="slide section">
      <div class="kicker">{esc(kicker)}</div>
      <div class="srule"></div>
      <h2 class="big">{esc(big)}</h2>
      <p class="ssub">{esc(sub)}</p>
    </section>''')

def head(kicker, title, accent="ekg"):
    return f'<div class="bar {accent}"></div><div class="kicker {accent}">{esc(kicker)}</div><h2>{esc(title)}</h2>'

def bullets_slide(kicker, title, items, accent="ekg"):
    lis = "".join(f'<li>{esc(t)}</li>' for t in items)
    slides.append(f'<section class="slide content">{head(kicker,title,accent)}<ul class="bul">{lis}</ul></section>')

def twocol_slide(kicker, title, lt, li, rt, ri, accent="ekg", accL="ekg", accR="amber"):
    def card(t, items, acc):
        lis = "".join(f'<li>{esc(x)}</li>' for x in items)
        return f'<div class="card {acc}"><h3>{esc(t)}</h3><ul>{lis}</ul></div>'
    slides.append(f'<section class="slide content">{head(kicker,title,accent)}<div class="cols">{card(lt,li,accL)}{card(rt,ri,accR)}</div></section>')

def arch_slide():
    boxes = [
        ("ekg","DEVICE — PWA",["React + TS UI","IndexedDB (Dexie)","Op-log sync engine","WebCrypto vault","Operators + audit"]),
        ("amber","OPTIONAL — Sync service",["Fastify, multi-tenant","Conflict-aware /sync","OIDC admin + console","Quota · retention · limits","PostgreSQL"]),
        ("blue","OPTIONAL — EHR gateway",["ONE ID / Ontario Health","PCR $match · handover","mTLS, server-side","NEMSIS/OADS export","Audit trail"]),
    ]
    cards=""
    for i,(acc,t,items) in enumerate(boxes):
        lis="".join(f"<li>{esc(x)}</li>" for x in items)
        cards+=f'<div class="abox {acc}"><div class="atop"></div><h4>{esc(t)}</h4><ul>{lis}</ul></div>'
        if i<2: cards+='<div class="arrow">→</div>'
    foot='The PWA is fully functional with neither optional tier present. Sync and the EHR gateway are additive, server-side, and off by default.'
    slides.append(f'<section class="slide content">{head("Architecture","Offline-first core, optional everything else")}<div class="arch">{cards}</div><p class="archfoot">{esc(foot)}</p></section>')

def shot_slide(kicker, title, img, caption, accent="ekg"):
    slides.append(f'<section class="slide content">{head(kicker,title,accent)}'
                  f'<div class="shot"><img src="img/{img}" alt="{esc(caption)}"><div class="cap">{esc(caption)}</div></div></section>')

def duo_shot(kicker, title, img1, cap1, img2, cap2, accent="ekg"):
    def fig(img, cap):
        return f'<figure><img src="img/{img}" alt="{esc(cap)}"><figcaption>{esc(cap)}</figcaption></figure>'
    slides.append(f'<section class="slide content">{head(kicker,title,accent)}'
                  f'<div class="duo">{fig(img1,cap1)}{fig(img2,cap2)}</div></section>')

def closing_slide():
    slides.append('''<section class="slide title closing">
      <div class="rule"></div>
      <h1>Document anywhere.</h1>
      <p class="lede">Offline-first by design · encrypted &amp; audited · ready for the cloud only when you want it.</p>
      <p class="note">TRIAGE-LINK — PWA · multi-tenant backend · Humanitarian &amp; Ontario EMS flavors</p>
    </section>''')

# ---------------- content (mirrors the deck) ----------------
title_slide("TRIAGE-LINK",
    "Offline-first PWA for field casualty documentation & coordination",
    "Capability overview — the PWA, the encryption & audit layer, the hosted multi-tenant backend with admin security, and the market flavors (Humanitarian / NGO · Ontario EMS / regulated · productized backend).")

bullets_slide("Positioning","One field record, no signal required",[
    "Document a casualty completely OFFLINE — injuries, vitals, treatments, photos, triage, handover — with no server in the loop.",
    "Built for where connectivity is unreliable or absent: disaster/MCI, humanitarian field clinics, mass-gathering and prehospital EMS.",
    "Installs as a PWA; data lives locally in IndexedDB and survives reloads, crashes, and power cycles.",
    "Optional, never-required sync aggregates records across a team only where a deployment wants it.",
    "One codebase, three market 'flavors' that share the offline-first core.",
])

arch_slide()

twocol_slide("PWA · Capture","Documenting a casualty",
    "Body & injuries",["Tap-to-mark injuries on an anterior/posterior body chart","Injury palette (GSW, burn, laceration, fracture…) + severity","Per-injury notes + wound photos (stored as out-of-line blobs)","Burn TBSA auto-estimate (Lund–Browder by age band)"],
    "Triage & identity",["START-style tag: Immediate / Delayed / Minor / Deceased","Patient: name, DOB→age band, sex, MRN, NOK, blood type","Incident: time, mechanism, location","Color-coded multi-casualty Triage Board"],
    accL="ekg",accR="ekg")

shot_slide("PWA · Screenshot","The field record — one screen, fully offline",
    "app-record.png",
    "Triage tag · patient identity · incident · injury body-chart · acuity glance (GCS, TBSA) · vitals — captured on-device.")

twocol_slide("PWA · Clinical","Vitals, interventions & trends",
    "Vitals & scoring",["Timestamped vital sets: HR, BP, RR, SpO₂, GCS, pain","Built-in GCS calculator (eye/verbal/motor → total)","Vitals-trend sparklines once ≥2 readings exist","Time-since-injury clock (T+) on the record"],
    "Treatments",["Structured log: tourniquet, airway, decompression, IV/fluids,","medication, splinting, wound packing, CPR…","Each entry timestamped + attributed to the on-duty operator","Feeds the AT-MIST handover summary"],
    accL="ekg",accR="blue")

bullets_slide("PWA · Handover","Summaries & clean handoff",[
    "One-page printable Casualty Summary card (AT-MIST) — print or save as PDF for handover.",
    "Scene Summary / command roll-up: casualties tallied by triage, on-scene vs handed-over.",
    "Handover sign-off (who took over care, facility, time) emitted as a FHIR handover bundle.",
    "Optional 'Send to EHR' contributes the handover to a provincial EHR via the gateway.",
    "Everything renders offline; nothing leaves the device unless you export or sync.",
])

duo_shot("PWA · Screenshot","Handover card & the scene picture",
    "app-summary.png","One-page AT-MIST casualty card — print or save as PDF.",
    "app-board.png","Triage Board — every casualty by acuity, on-scene vs handed-over.",
    accent="ekg")

twocol_slide("PWA · Accessibility","Four languages, guided & spoken",
    "Internationalization",["EN / FR / AR / FA built in — Arabic & Persian fully RTL","Loadable JSON language packs: add a language with NO app release","Downloadable English template to translate; parity-tested in CI","Natural wording, not literal — reviewed per language"],
    "Guided tour",["Smart tour highlights each real control","Offline voice-over (SpeechSynthesis) in the active language","Action steps auto-advance once the user does them","Every user-visible feature is taught in the tour (enforced)"],
    accL="ekg",accR="blue")

shot_slide("PWA · Screenshot","The guided tour, in the active language",
    "app-tour.png",
    "A 15-step smart tour spotlights each real control with offline voice-over — now covering operators, the vault, backup & restore and language packs, not just the capture flow. The body-chart step auto-advances once a marker is dropped.",
    accent="blue")

bullets_slide("PWA · Platform","Installable, offline, durable",[
    "Installable PWA (service worker + Workbox precache) — launches and runs with no network.",
    "All data in IndexedDB via Dexie; records, op-log, photos, audit chain persist locally.",
    "Phones, tablets, laptops; responsive layout collapses gracefully on small screens.",
    "No telemetry, no implicit network calls — a casualty is documented entirely on-device.",
])

bullets_slide("Data integrity","Conflict-aware op-log sync engine",[
    "Every change is journaled as an immutable operation (scalars + collections), not a blind overwrite.",
    "Deterministic resolve(): Lamport clocks order edits; ties break predictably — same inputs, same result, every device.",
    "Concurrent edits to different fields all survive; same-field edits pick a deterministic winner and REPORT the conflict (losing op retained).",
    "The server stores and folds ops — it does not implement its own divergent merge logic.",
    "Incremental sync (cursor) pulls only what changed; full-state pulls are paginated.",
], accent="blue")

twocol_slide("Security · At rest","Opt-in encryption vault",
    "How it works",["AES-256-GCM, key derived from a passphrase via PBKDF2 (210k iters)","Encrypts the heaviest PHI — wound photos — plus records & op-log","Key lives only in memory while unlocked; locking drops it","Idle auto-lock; wrong passphrase rejected via a verifier"],
    "Safety posture",["DEFAULT-OFF: with no vault, behavior is byte-for-byte unchanged","Mixed plaintext/encrypted rows read correctly through a toggle","Sealed records unreadable (get/list skip them) while locked","Crash-safe enable/disable — data is never orphaned"],
    accent="amber",accL="amber",accR="ekg")

shot_slide("Security · Screenshot","Locked — PHI sealed behind a passphrase",
    "app-vault.png",
    "With the vault on, an idle device auto-locks to this screen: records, the op-log and wound photos are AES-256-GCM encrypted at rest and unreadable until the passphrase is re-entered. The key never leaves memory.",
    accent="amber")

twocol_slide("Security · Access","Operators, RBAC-lite & tamper-evident audit",
    "Shared-device access",["Local operator roster (field / lead / admin)","Records & audit entries attributed to the on-duty operator","Step-up PIN re-auth gates sensitive actions (delete, export…)","Empty roster = open (community default); adding operators opts in"],
    "Audit log",["Append-only, hash-chained entries (SHA-256 per entry)","Tampering/deletion breaks the chain — detectable offline","No update/delete API; reviewable even while the vault is locked","Covers create / view / delete / export / vault / step-up"],
    accent="amber",accL="amber",accR="amber")

duo_shot("Security · Screenshot","Operator attribution & the hash-chained log",
    "app-operators.png","Operator roster — records & actions attributed to the on-duty operator; a PIN gates sensitive actions.",
    "app-audit.png","Append-only, hash-chained audit — “Verify chain” detects any tampering, offline.",
    accent="amber")

twocol_slide("Data portability","Backup, restore & export",
    "Backup / restore",["Full JSON backup of every record (plain or encrypted)","Restore by merge (keep newer of duplicates) or replace","Encrypted backup keeps PHI unreadable without the passphrase"],
    "CSV interchange",["Roster CSV export (identity + incident) for analytics/QA","CSV import onboards a patient list from paper/another system","Date-range filter scopes an export to a window","Deployment provenance stamped on rows (humanitarian)"],
    accL="ekg",accR="blue")

bullets_slide("Hosted backend","Multi-tenant sync service (Fastify)",[
    "Optional cloud or self-hosted backend for cross-team aggregation — the PWA never requires it.",
    "Per-tenant isolation: each API key authenticates AND scopes a tenant's data; conflict-aware /sync stores and folds ops.",
    "Hardened: sanitized error envelopes, paginated pulls, per-tenant storage quota, audit-log retention TTL.",
    "OpenAPI 3 + Swagger UI; liveness/readiness probes; per-tenant metrics; request-id correlation.",
    "Runs on PostgreSQL; graceful shutdown; rate-limited per IP.",
], accent="amber")

twocol_slide("Hosted backend · Admin","Admin security & console",
    "Admin authentication",["Tenant-admin API (/admin/*) behind a static token OR OIDC SSO","OIDC: IdP-issued JWT, audience-checked, optional role mapping","Provision tenants; issue / rotate / revoke per-tenant API keys","Every admin mutation written to a separate admin-audit trail"],
    "Graphical console",["Opt-in static admin console at /console","Token-entry auth; holds no secrets (the API gate enforces)","Browse tenants, keys, metrics & audit from a browser","Off by default — enabled per deployment"],
    accent="amber",accL="amber",accR="amber")

section_slide("THREE MARKET FLAVORS","One core, productized three ways",
    "Humanitarian / NGO   ·   Ontario EMS (regulated)   ·   Productized backend")

twocol_slide("Flavor · Humanitarian / NGO","Field documentation where the cloud isn't",
    "Shipped on this line",["Deployment context — device-wide operation tag + provenance banner","Disaster/MCI mode — one toggle makes encryption mandatory + command roll-up","Kiosk defaults — assign-operator prompt + 2-min auto-lock on shared devices","Donor export — provenance-stamped CSV + date-range filter"],
    "More",["Retention presets — confirmed, step-up-gated purge window (off/30/90/180/365 d)","Air-gapped packaging — one Docker stack (PWA + sync + Postgres) offline on a laptop","Loadable language packs for any region; encrypted backups for low-infra handoff","Intended use = documentation/coordination tool (light reg load)"],
    accL="ekg",accR="ekg")

twocol_slide("Flavor · Ontario EMS (regulated)","Toward a conformant ePCR",
    "NEMSIS / OADS conformance",["Section exporter maps captured data → NEMSIS v3.5 / OADS v4.0 shapes","Deterministic offline XML serializer (shaped, gap-annotated)","Pluggable validator (cardinality/datatype/value-set) + placeholder ruleset","Capture panels: eResponse / eTimes / eCrew / eScene — gaps clear at runtime"],
    "In-app & integration",["Read-only Conformance view: live gaps + validator issues, in 4 languages","Clearly labelled NOT certification (placeholder ruleset, rulesetSource shown)","ONE ID / Ontario Health gateway scaffold (mTLS, server-side) for PCR $match","Gated next: official-dictionary reconciliation + live ONE ID credentials"],
    accent="blue",accL="blue",accR="blue")

shot_slide("Flavor · Screenshot","In-app NEMSIS / OADS conformance pre-check",
    "app-conformance.png",
    "Read-only conformance view: sections mapped, validator errors/warnings, and capture gaps — clearly labelled NOT certification (placeholder ruleset). Exports shaped NEMSIS v3.5 XML offline.",
    accent="blue")

bullets_slide("Flavor · Productized backend","The shared, hardened service line",[
    "The multi-tenant sync service + admin security is the common spine both market branches reuse.",
    "Multi-tenant isolation, OIDC SSO + role-based admin, per-tenant rate limits & quota, incremental sync.",
    "EHR-access and admin audit trails — necessary for any regulated, multi-service deployment.",
    "Cascaded to every flavor branch, so a hardening fix lands everywhere.",
], accent="amber")

twocol_slide("Status","Where things stand",
    "Done & merged",["Full offline PWA: capture, triage, vitals, handover, summaries","Encryption vault · operators · step-up · tamper-evident audit","Multi-tenant backend hardening + graphical admin console","Humanitarian: all 5 roadmap items (context→MCI→export→retention→air-gap)","Ontario: NEMSIS pipeline + capture panels + in-app conformance view"],
    "Externally gated next",["Ontario PR-2c — official NEMSIS/OADS dictionary + true XSD validation","Ontario PR-4 — live ONE ID credentials + real mTLS client cert","SOC 2 Type II / QMS / SaMD evidence (if intended use crosses the device line)","CAD / hospital-EHR handover partnerships"],
    accL="ekg",accR="amber")

closing_slide()

deck = "\n".join(slides)
total = len(slides)

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0E1116;--panel:#161B22;--panel2:#1B222C;--line:#2A3340;--ink:#E6EDF3;
 --dim:#A2AEBE;--faint:#8E9BAD;--ekg:#3FE08A;--amber:#F2820F;--blue:#3F9BD6;--red:#E5484D;
 --sans:'Segoe UI',system-ui,-apple-system,sans-serif;--mono:'Consolas','SF Mono',ui-monospace,monospace}
html,body{background:#05070a;font-family:var(--sans);color:var(--ink)}
.slide{position:relative;width:1280px;height:720px;background:var(--bg);overflow:hidden;
 padding:54px 64px;display:flex;flex-direction:column}
.accent-ekg{color:var(--ekg)}
.bar{position:absolute;left:40px;top:46px;width:7px;height:62px;border-radius:3px}
.bar.ekg{background:var(--ekg)}.bar.amber{background:var(--amber)}.bar.blue{background:var(--blue)}
.kicker{font-family:var(--mono);font-size:15px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-left:18px}
.kicker.ekg{color:var(--ekg)}.kicker.amber{color:var(--amber)}.kicker.blue{color:var(--blue)}
.slide.content h2{margin:6px 0 0 18px;font-size:38px;font-weight:700;letter-spacing:-.3px}
ul.bul{list-style:none;margin:38px 6px 0 18px;display:flex;flex-direction:column;gap:18px}
ul.bul li{position:relative;padding-left:30px;font-size:20px;line-height:1.34;color:var(--ink);max-width:1120px}
ul.bul li::before{content:'▸';position:absolute;left:0;color:var(--ekg);font-weight:700}
.cols{display:flex;gap:28px;margin:34px 0 0 0;flex:1}
.card{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px 26px}
.card h3{font-size:19px;margin-bottom:16px}
.card.ekg h3{color:var(--ekg)}.card.amber h3{color:var(--amber)}.card.blue h3{color:var(--blue)}
.card ul{list-style:none;display:flex;flex-direction:column;gap:11px}
.card li{position:relative;padding-left:20px;font-size:16.5px;line-height:1.3;color:var(--ink)}
.card li::before{content:'•';position:absolute;left:0;font-weight:700;opacity:.85}
.card.ekg li::before{color:var(--ekg)}.card.amber li::before{color:var(--amber)}.card.blue li::before{color:var(--blue)}
/* title */
.slide.title{justify-content:center}
.slide.title .rule{position:absolute;left:0;right:0;top:312px;height:4px;background:var(--ekg)}
.slide.title h1{font-size:88px;font-weight:800;letter-spacing:-1px}
.slide.title .lede{margin-top:18px;font-size:27px;color:var(--ekg);font-weight:500}
.slide.title .note{margin-top:26px;font-size:18px;color:var(--dim);max-width:1040px;line-height:1.5}
.slide.title .stack{position:absolute;left:64px;bottom:54px;font-family:var(--mono);font-size:14px;color:var(--faint)}
.slide.closing h1{font-size:74px}
/* section */
.slide.section{justify-content:center}
.slide.section .kicker{margin-left:0;color:var(--ekg);font-size:18px}
.slide.section .srule{width:150px;height:5px;background:var(--ekg);margin:18px 0 6px}
.slide.section .big{font-size:52px;font-weight:800;letter-spacing:-.5px}
.slide.section .ssub{margin-top:18px;font-size:21px;color:var(--dim)}
/* arch */
.arch{display:flex;align-items:stretch;gap:0;margin:40px 0 0 0;flex:1}
.abox{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:0 22px 18px;position:relative;overflow:hidden}
.abox .atop{position:absolute;left:0;right:0;top:0;height:8px}
.abox.ekg .atop{background:var(--ekg)}.abox.amber .atop{background:var(--amber)}.abox.blue .atop{background:var(--blue)}
.abox h4{font-family:var(--mono);font-size:16px;margin:26px 0 14px;letter-spacing:.5px}
.abox.ekg h4{color:var(--ekg)}.abox.amber h4{color:var(--amber)}.abox.blue h4{color:var(--blue)}
.abox ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.abox li{position:relative;padding-left:18px;font-size:16px;color:var(--ink)}
.abox li::before{content:'•';position:absolute;left:0;opacity:.7}
.arrow{display:flex;align-items:center;justify-content:center;width:64px;color:var(--faint);font-size:34px;flex:0 0 64px}
.archfoot{margin-top:26px;font-size:17px;color:var(--dim);line-height:1.45;max-width:1140px}
/* screenshots */
.shot{display:flex;flex-direction:column;align-items:center;justify-content:center;margin-top:22px;flex:1;min-height:0}
.shot img{max-width:100%;max-height:472px;border:1px solid var(--line);border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.shot .cap{margin-top:16px;font-size:15px;color:var(--dim);text-align:center;max-width:1100px}
.duo{display:flex;gap:30px;margin-top:24px;flex:1;align-items:center;justify-content:center;min-height:0}
.duo figure{display:flex;flex-direction:column;align-items:center;max-width:49%}
.duo img{max-width:100%;max-height:430px;border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.5)}
.duo figcaption{margin-top:12px;font-size:14px;color:var(--dim);text-align:center}
/* footer */
.foot{position:absolute;left:64px;bottom:26px;font-family:var(--mono);font-size:13px;color:var(--faint)}
.foot b{color:var(--ekg)}
.pnum{position:absolute;right:60px;bottom:26px;font-family:var(--mono);font-size:13px;color:var(--faint)}
/* screen viewer */
@media screen{
 body{display:flex;align-items:center;justify-content:center;min-height:100vh}
 .deck{transform:scale(var(--scale,1));transform-origin:center}
 .slide{display:none;box-shadow:0 30px 90px rgba(0,0,0,.6);border-radius:10px}
 .slide.active{display:flex}
 .hint{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);font:12px var(--mono);color:#56616f}
}
@media print{
 @page{size:1280px 720px;margin:0}
 html,body{background:#fff}
 .slide{display:flex!important;page-break-after:always;break-after:page;box-shadow:none;border-radius:0}
 .hint{display:none}
}
"""

JS = """
const slides=[...document.querySelectorAll('.slide')];let i=0;
function show(n){slides.forEach((s,k)=>s.classList.toggle('active',k===n))}
function fit(){const s=Math.min(window.innerWidth/1280,window.innerHeight/720)*0.96;
 document.querySelector('.deck').style.setProperty('--scale',s)}
addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '){i=Math.min(i+1,slides.length-1);show(i)}
 if(e.key==='ArrowLeft'){i=Math.max(i-1,0);show(i)}});
addEventListener('resize',fit);fit();show(0);
"""

# add footers + numbers to each slide
import re
def add_chrome(s, n):
    foot = '<div class="foot"><b>TRIAGE-LINK</b>  offline-first field casualty documentation</div>'
    num = f'<div class="pnum">{n:02d}</div>'
    return s[:-len('</section>')] + foot + num + '</section>'

slides2 = [add_chrome(s, k+1) for k,s in enumerate(slides)]
deck = "\n".join(slides2)

doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TRIAGE-LINK — capability overview</title>
<style>{CSS}</style></head>
<body><div class="deck">{deck}</div>
<div class="hint">← / → to navigate · {total} slides · print for PDF</div>
<script>{JS}</script></body></html>"""

pathlib.Path(OUT).write_text(doc, encoding="utf-8")
print("wrote", OUT, "—", total, "slides,", len(doc), "bytes")
