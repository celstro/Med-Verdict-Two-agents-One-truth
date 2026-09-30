# MED-VERDICT
### AI Clinical Second Opinion Reconciler

> **Two agents. One patient. One reconcilable truth — in a transcript you can interrogate down to the atom.**

**Track:** Omega AI Agents · L-1 / L-2 / L-3 · **Track 01 — Two Agents, One Truth**
**Event:** SingularityNET × Omega × BASIX.Market Hackathon · SJIT Chennai + Kenyatta University of Engineering · 30 Sept – 2 Oct 2026

> ### ⚠ Read this first
> **Research prototype. Synthetic data. Not a medical device, not clinical advice.**
> Every patient record, therapy, trial figure, registry and protocol clause in this repository is
> **invented**. Drug identifiers (`TPX-114`, `NRV-7`, `LVX-9`…) are fictional. There is no real PHI
> anywhere in this project, and none should ever be added. What this project demonstrates is an
> auditable negotiation *protocol* — the clinical content is a fixture, the reasoning architecture is
> the product.

---

## 1. The problem

A complex patient is not a simple patient. Real cases have a licensed standard of care that is
well replicated but organ-damaging, and a novel agent with a better response rate in a
biomarker-matched subgroup that exists on 112 patients from a single-arm trial. Both options are
defensible. They are not interchangeable.

Somewhere in that gap sits a second opinion — and today it arrives as a paragraph of prose with no
provenance. Nobody can tell which recommendation came from a local protocol and which came from a
phase 1b abstract, because the model that produced them does not say. So the clinician either
trusts all of it or none of it, and in a field where being wrong kills people, "none of it" is
usually what happens.

## 2. The solution

Two agents with genuinely opposed priors read the **same case file** and the **same evidence
ledger**, and are made to disagree in public and then reconcile.

| | **ATLAS** — Agent A | **NOVA** — Agent B |
| --- | --- | --- |
| Role | Local Conservative Analyst | Global Innovation Analyst |
| Bound to | `LOCAL-PROTO-2026` | `GLOBAL-TRIALS-INDEX-2026` |
| Efficacy weight | 0.14 | 0.28 |
| Toxicity headroom | 0.26 | 0.14 |
| Local protocol | 0.16 | 0.02 |
| **Innovation** | **0.00** | 0.24 |
| Off-label | non-admissible | admissible, with procedure |

They are not two personas bolted onto one model. They are two separate symbolic rule bases over an
identical fact base, with different weight vectors. The disagreement is therefore *mathematical*,
inspectable, and reproducible — not a matter of tone.

The protocol resolves it into exactly one of four shapes:

- **`CONSENSUS`** — both agents land on the same therapy
- **`CONDITIONAL_TRUTH`** — the innovative option wins the trade-off, and is adopted **only** inside
  the conservative agent's scaffolding: consent, MDT sign-off, published stop-rules, week-1/2
  intensive monitoring, and a licensed fallback held one decision away
- **`PALIATIVE`** — every active option is gated, and the output is a **documented refusal**
- **`ESCALATE`** — irreducible, or confidence below the autonomy floor

## 3. Why this is the right shape for the track

Track 01 asks for *"two agents that have to reconcile disagreeing beliefs about the same fact … and
explain how they got to an answer both can live with."* The load-bearing design decision is that
**both can live with** is a *testable* condition, not a vibe:

> Each agent states the **minimum sufficient conditions** under which it would accept the other's
> therapy. The composite plan is then run against every one of those conditions. That is the
> satisfiability test, and the unmet conditions are printed in the escalation rather than quietly
> dropped.

## 4. Try it

```bash
git clone <this-repo> med-verdict
cd med-verdict

# it is a static site with zero dependencies and zero build step
open index.html          # works straight from file://

# or, if you prefer a server
npm start                # → http://localhost:4173
```

Then: pick a case → **Run reconciliation** → click any transcript step → **Show provenance**.

```bash
npm test                 # 45 assertions across the engine, exports, charts and determinism
npm run audit            # regenerate the sample transcripts in docs/
```

## 5. The three shipped cases

| Case | Presentation | Verdict | What it demonstrates |
| --- | --- | --- | --- |
| `CV-2291` | Stage IIIB NSCLC, eGFR 42, PD-L1 55% | `CONDITIONAL_TRUTH` 76.8% | Innovation adopted **under safeguards**, licensed grade-A fallback retained |
| `CV-3310` | r/r DLBCL post-CAR-T, prior grade-3 pneumonitis | `CONSENSUS` 73.2% | NOVA's preference is **blocked by a gate**; agents converge without it; cumulative toxicity forces sequencing |
| `CV-4477` | mCRC, ECOG 3, palliative goal | `PALIATIVE` 70% | A **documented refusal**. The system declines to treat — and that is a result, not a failure |

Plus three reviewer adjudications that rewrite the agents' own rules and visibly move the verdict:

| Adjudication | Effect on `CV-2291` |
| --- | --- |
| none (baseline) | `CONDITIONAL_TRUTH` 76.8% |
| clinician veto of `LVX-9` | `ESCALATE` 60.2% |
| institutional bar on off-label therapy | `CONSENSUS` 94% |

## 5b. Ask the agents

Under the console there is a chat surface with the two agents in it. Type a question, or press
**Ask them to conclude** and watch them argue it out and land on a plan.

| | **ATLAS** — The Safety Agent | **NOVA** — The New Ideas Agent |
| --- | --- | --- |
| Follows | proven evidence, established guidelines, strict safety limits | the latest research and promising new treatments |
| Focus | protecting the patient; trusted medical standards | identifying potential benefit — *and saying how weak the evidence is* |
| Obligation | never recommends what it cannot trace to protocol | **never asserts a benefit without stating the evidence grade** |

**There is no language model behind this chat.** Every reply is composed by the same two rule bases
that produce the transcript, reading the same sealed run, and every reply carries the citations that
produced it. Ask something the evidence cannot support and they say so — that refusal is the point,
not a gap in the build.

Twelve intents are handled: *why · safety · innovation · evidence strength · protocol status ·
consent & obligations · fallback · confidence · biomarkers · cost · compare cases · conclude.* An
unrecognised question gets an honest "I can only answer what the rule bases support" rather than a
fluent guess.

**They conclude.** "Ask them to conclude" runs a full exchange: each states its position, they
cross-examine each other with cited challenges, any gated preference is **disclosed out loud**, the
arbiter states the resolution shape, the plan (or a refusal) is stated, NOVA attaches its evidence
caveat, and the last thing on screen is the list of obligations before anything is administered.

A case missing a diagnosis or an ECOG gets no drug at all — they refuse and tell you which field to fill in.

## 6. The four Omega capabilities, used as the feature

The track asks for MeTTa's identity — reasoning, self-modification, memory, symbolic logic — to be
the product rather than the homework. Each of these is load-bearing. Delete one and the product
stops working rather than degrading.

### Auditable reasoning
A hand-written forward-chaining reasoner over MeTTa-style atoms (`(indication-match NRV-7)`). Every
derived atom retains the rule that fired it and the exact premises consumed. Click any claim and you
get the rule id, the rule's stated rationale, and the chain back to raw case facts.

### Self-modification
A reviewer input is compiled into **new rules injected symmetrically into both agents' rule bases**,
and the literal before/after rule diff is displayed line by line. The base rule set contains **no**
human-override rule at all — the fourth gate is created by a person, not shipped with the software,
and the diff is the proof.

### Stateful memory
Adjudications persist to `localStorage` and reload as precedent, signed into the seal. Run a case,
switch cases, come back: the second run cites the first and shows the confidence term it moved.

### Symmetric constraint
The three clinical hard rules are structurally identical in both agents. Whatever the agents
disagree about, neither can trade away an absolute contraindication. A reviewer who constrains NOVA
constrains ATLAS in the same breath — **asymmetric control is not a safety feature, it is a safety
hole.**

## 7. The safety architecture, in one paragraph

Disagreement is permitted to be **total**; it is never permitted to be **permissive**. The hard-gate
overlay is therefore evaluated *after* the negotiation, by a layer neither agent can address. A gate
that can be out-voted by a better argument is not a gate. Where a gate refuses an agent's first
preference, the refusal is **written into the audit trail with the rule that fired** — the reviewer
must be able to see exactly what the system wanted to do and could not. That is the single most
important line in the document.

Four thresholds are applied, and all four are printed with their arithmetic:

| Threshold | Value | Meaning |
| --- | --- | --- |
| `toxConcurrentCeiling` | 18% grade ≥3 | above this, two agents are never run at once |
| `toxPrimaryCeiling` | 30% grade ≥3 | ceiling for a primary agent |
| `toxFrailCeiling` | 22% grade ≥3 | tightens to this for ECOG ≥ 2 — applied *before* ranking |
| `toxCombinedCeiling` | 55% grade ≥3 | cumulative across two concurrent agents |

Confidence is likewise never asserted. It is a visible sum of nine named terms, capped at 78% when an
off-label component leads, capped at 70% at ECOG ≥ 3, and capped at 94% on principle. **Below 70% the
system refuses to recommend autonomously.**

## 8. The audit trail is tamper-evident

Every step carries `hash = SHA256(prev ‖ step)`, chained from the literal string `GENESIS`. The last
hash is the seal. Change one character in any step body and every hash after it breaks — so a
reviewer can tell the difference between a transcript that was *generated* and one that was *edited*.

```bash
npm run audit     # regenerate; deterministic, so re-running is a no-op diff
```

The exported Markdown is designed to be read **without the app running** — by a clinician, an
auditor, or an MDT. It is in `docs/`, and it is the deliverable the track actually asks for.

## 9. The compromise that cannot cheat

The reconciled weight vector is the **log-pooled** (geometric-mean, renormalised) compromise of the
two agents' vectors. Not arithmetic mean — because an arithmetic average lets a criterion one agent
considers irrelevant be rescued by the other's enthusiasm.

The visible consequence is the point of the whole demo:

```
Innovation    √(0.00 × 0.24)  →  0.000
```

ATLAS assigns innovation a weight of zero, so **no amount of NOVA's enthusiasm can conjure a value
out of a zero.** A compromise cannot invent a value one side refuses to hold. The arithmetic respects
the disagreement instead of averaging it away.

## 10. Technology

Hand-written, zero runtime dependencies, zero build step.

| File | Role |
| --- | --- |
| `assets/js/metta.js` | MeTTa-style atom parser, unifier, forward-chaining engine, provenance backtracker |
| `assets/js/kb.js` | Both agents' symbolic rule bases, adjudications, the numeric scoring layer |
| `assets/js/protocol.js` | The six-round reconciliation protocol, gates, thresholds, confidence |
| `assets/js/ingest.js` | Case upload: JSON / CSV / free-text / FHIR-ish → validated `caseRec` |
| `assets/js/chat.js` | Two-agent dialogue surface — rule-based, every reply cited |
| `assets/js/memory.js` | Stateful memory, self-modification, rule-base diffing |
| `assets/js/charts.js` | Dependency-free SVG: trade-off frontier, scoreboard, weight profile, confidence waterfall |
| `assets/js/audit.js` | Markdown + JSON export, hash-chain verification |
| `assets/js/sha256.js` | Synchronous SHA-256, so the chain works on `file://` without WebCrypto |
| `assets/js/app.js` | Console, streaming transcript, provenance drawer |

Runs entirely in the browser. **The reconciliation engine makes no API calls and has no backend** — which
means the reasoning cannot fail on venue wifi, and the whole thing is auditable by reading five files.

**One deliberate exception: Google sign-in.** The portal loads
[Google Identity Services](https://accounts.google.com/gsi/client) from `accounts.google.com`. That is
the only outbound request this build makes, and it happens at the door, not in the reasoning. It is
called out here, in §11, and in the UI rather than quietly assumed away.

| `assets/js/auth.js` | Google-only sign-in portal. No password form, no second provider. |
|---|---|

## 11. AI Disclosure

Required by the 24HR track, and stated plainly:

> **No generative language model participates in the reasoning loop — or in the chat.** Every atom,
> rule firing, score, threshold comparison, verdict and chat reply in this repository is produced by
> the deterministic neural-symbolic engine above, executing over a synthetic ledger. The outputs are
> byte-reproducible: `npm test` asserts that the same input yields the same SHA-256 seal, that the
> same question yields the same chat answer, and that `npm run audit` regenerates the transcripts
> identically.
>
> External LLM assistance was used for **UI scaffolding and copywriting only** — layout, CSS, and
> prose. It did not author the protocol, the rule bases, the scoring model, the chat intents, or any
> clinical content.
>
> This matters for the track's own reasons: an auditable-reasoning demo that quietly called a
> language model would be a black box wearing a lab coat. If you cannot replay it, you cannot audit it.

### What the sign-in portal does and does not do

The portal is Google-only because that is a property of the mechanism — Google Identity Services
cannot return a non-Google identity — rather than a filter applied afterwards. There is no password
field, no email/password fallback, and no second provider.

Two limitations we are stating rather than hiding:

1. **There is no server, so the ID token is not verified.** Google's client library hands the browser a
   JWT; `auth.js` decodes the payload to read `email`, `email_verified`, `aud` and `exp`. It checks
   that `aud` matches this deployment's client id (so the token cannot be replayed from another app)
   and that the token has not expired. It does **not** check the signature, and a decoded JWT payload
   is trivially forgeable. A production deployment must verify `iss`, `aud`, `exp` and the signature
   against Google's JWKS on a backend. We shipped no backend because the track is scored on auditable
   reasoning, not on auth.
2. **The offline demo path is not authentication.** If no OAuth client id is configured, or
   `accounts.google.com` is unreachable, the portal offers "continue in offline demo mode". It is
   labelled as unverified in the UI, and the exported audit trail marks the run
   `unverified — demo mode, no identity was checked`. It exists so a live demo cannot die on a
   missing client id or on venue wifi. It is not a security control.

**To enable real sign-in:** paste a Web-application OAuth client id into `CONFIG.clientId` at the top of
`assets/js/auth.js`, and add both `http://localhost:4173` and `http://127.0.0.1:4173` to the
authorised JavaScript origins. Optionally set `CONFIG.allowedDomains` to restrict sign-in to specific
email domains.

## 12. What we would build next

1. **Move the rule bases onto a real MeTTa / Omega runtime** (Hyperon) instead of the in-browser
   engine, so the symbolic core is shared with the wider ecosystem rather than merely compatible.
2. **A third agent**: a sceptical pharmacovigilance reader that challenges *toxicity claims only* and
   has no efficacy vote. An adversary with a narrow remit is often more useful than a second generalist.
3. **Longitudinal memory across a patient episode**, not a single case file — the interesting conflicts
   arrive over months, not at the first consult.
4. **Prospective evaluation against a real MDT** on retrospective cases, measuring the number that
   actually matters: how often does the gate overturn the agents?
5. **An EHR review-queue adapter** so the export lands where a clinician already works.

The honest answer to *"would a hospital use this?"* is **not yet** — and that is the point. The first
thing to earn trust in a clinical setting is an audit trail nobody has to take on faith.

## 13. 3-minute demo script

| Time | Shot | Narration |
| --- | --- | --- |
| 0:00–0:20 | Hero, scroll | The pitch. Two agents, one case, one truth — and you can interrogate every step of how we got there. |
| 0:20–1:00 | Console, `CV-2291`, run | Watch ATLAS and NOVA diverge on the same file. Same evidence, different weights. |
| 1:00–1:40 | Click a step → provenance | The rule id, its rationale, its premises, chained back to raw case facts. No black box. |
| 1:40–2:15 | Veto `LVX-9` | The rule base rewrites itself, **in both agents**, and the live diff appears. Watch the verdict move from 76.8% to 60.2% and escalate. |
| 2:15–2:45 | Switch to `CV-4477`, then **Ask them to conclude** | The refusal. A 57% subgroup response sits on the ledger, the gate fires anyway, and NOVA discloses the preference it was denied. |
| 2:45–3:00 | Chat: *"is it safe?"* then export the audit trail | Every reply cited. Then a hash-chained document a clinician can read without this app. |

## 14. Judging alignment

**Omega track criteria** — 30% Innovation, 30% Technical Implementation, 20% Sustainability Impact,
20% Documentation & Presentation.

| Criterion | Claim | Where to look |
| --- | --- | --- |
| Innovation | A negotiation protocol where the safety gate wins by design, and the arithmetic compromise provably cannot manufacture a value one agent refuses to hold. | `protocol.js` §reconcile; `docs/cv-2291-transcript.md` |
| Technical | A real forward-chaining reasoner, symmetric rule injection, hash chaining, persistent memory — all hand-written, no libraries, deterministic. | `metta.js`, `kb.js`, `memory.js`, `sha256.js`; `npm test` |
| Sustainability | Audit trails for scarce clinical decision capacity; the governance pattern transfers unchanged to any high-stakes domain — lending, insurance, hiring, safety-critical engineering. | `checkCondition` gate pattern |
| Documentation | The exported transcript is readable by a non-technical reviewer. **The export *is* the documentation.** | `docs/`, `audit.js` |

**All-track criteria** — 30% Technical execution, 25% Demo clarity, 25% Fit to track, 20%
Collaboration & documentation.

| Requirement | Status |
| --- | --- |
| 1 · Strong one-line pitch | In the hero, the README and the first ten seconds of the video |
| 2 · Scoped to one small agent, one clear behaviour | One protocol, one console, one export. No platform. |
| 3 · MeTTa identity as the feature, not homework | Four capabilities, each load-bearing — see §6 |
| 4 · Fun, multiplayer-feeling | A live arena: colour, voice, creeds, leaderboards, and a referee |
| Working repository | Zero dependencies, zero build, runs from `file://` |
| Short written documentation | This file |
| Sample reasoning transcript | `docs/*.md` + in-app export |
| 3-minute video | Script in §13 |
| AI Disclosure | §11 |

---

## Licence

MIT. SingularityNET / Omega / MeTTa are the property of their respective owners; this project is an
independent track submission and is not affiliated with or endorsed by them.
