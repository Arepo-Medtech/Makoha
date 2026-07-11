# MEDGEMMA-ADAPTER-PLAN.md — MedGemma as an alternative / fallback Step-4 generation backend

**Status:** Phase-2 plan (design). **No code until approved.** Sibling to LIVE_PLAN L3.
**Author role:** Breath-Ezy AI Architect.
**Baseline:** `main` after PRs #35–#37 (L3 live-LLM adapter merged/queued).

> **Not legal, clinical, or regulatory advice.** MedGemma is a licensed clinical model; whether it may be *used* in this CDSS, and under what terms, is an operator + qualified-specialist decision this plan surfaces — it does not decide it.

---

## 0. One-paragraph summary

MedGemma (Google Health) becomes a **second Step-4 generation backend** behind the *exact same bars* as the Claude adapter: it sees ONLY the validated ContextPacket, its output goes straight to the frozen verifier + detectors + PPP-TTT, and every failure fails closed to `BLOCKED_NO_PROOF`. It is a first-party clean-room HTTP adapter (`integration/llm-adapter-medgemma.js`) — **no Google code and no model weights enter the repo** (weights are gitignored/deploy-injected, exactly like the terminology RF2). It is **mock by default and runtime input-gated** on a deploy endpoint + secrets-seam key, mirroring `fhir-broker/live-backend.js` and `tooluniverse-gateway`. Two things are **yours to decide before build**: (1) the fallback semantics — I recommend availability-fallback + config-selectable backend, with **safety refusals never rerouted**; (2) licence + regulatory clearance to use a clinical generative model here.

---

## 1. How it fits the topology (unchanged spine)

L3 gave the pipeline a generation *hook* (`options.generate_candidate(packet)`), and `llm-adapter.js` is the first backend for it. MedGemma is a **second implementation of the same hook contract** — nothing else in the pipeline changes:

```
Step 4 hook: (packet) -> { ok, candidate_output?, status?, reason?, audit }
   ├── llm-adapter.js          (Claude; L3)
   └── llm-adapter-medgemma.js (MedGemma; THIS PLAN)  ← identical return shape
        ↓ (both feed)
   Step 5: frozen verifier + detectors + PPP-TTT  (UNCHANGED)
```

Both backends are subject to the identical **packet-only bar** (re-gate through the strict `validateContextPacket`; a smuggled field refuses before any transport call) and the identical fail-closed contract. The verifier still bars minted codes/doses/facts from *either* model. Nothing here sets `patient_eligible`; the frozen core stays byte-unchanged (CI pin).

---

## 2. The two operator decisions (build blocks on these)

### Decision A — Fallback semantics (safety-critical)

| Option | What it means | My read |
|---|---|---|
| **A1 — availability fallback + config-selectable backend (RECOMMENDED)** | A deployment can select MedGemma as its primary backend (`HEYDOC_LLM_BACKEND=medgemma`), OR run Claude primary with MedGemma as a fallback **only on availability failures** (timeout, API/network error, endpoint down). A **safety refusal (`stop_reason: "refusal"`) is NEVER rerouted** — it stays `BLOCKED_NO_PROOF` and escalates to a clinician. | A refusal is a *safety signal*, not an outage. Rerouting a refused clinical prompt to a second model to "get an answer anyway" is a gate-bypass anti-pattern. Availability fallback is legitimate; refusal reroute is not. |
| **A2 — full fallback incl. refusals** | Any Claude block (including refusal) reroutes to MedGemma. | **I advise against this.** It lets a second model answer exactly the prompts the first model declined on safety grounds. If you want it, it needs its own risk sign-off. |
| **A3 — alternative only, no fallback** | MedGemma is a config-selected backend; no automatic failover between models. | Simplest, safest, least resilient. |

**Recommendation: A1.** It gives you resilience and a data-residency/clinical-model option without ever using failover to route around a safety refusal.

### Decision B — Licence + regulatory clearance (you + specialists)

- MedGemma ships under the **Health AI Developer Foundations (HAI-DEF) terms of use** with a Prohibited-Use Policy — **not** an OSI open-source licence (Apache/MIT). Our `licence:check` gate and harvest discipline exist precisely for this.
- **What does NOT enter the repo:** no Google source code is wrapped/vendored (the adapter is first-party clean-room, like `record-sources`), and no weights are committed (gitignored + deploy-injected, like the SNOMED RF2). So there is **no new ADOPT manifest row for code** — but I will add a **REFERENCE manifest row** recording MedGemma's licence status so the gate and the register track it.
- **What IS your decision:** whether the HAI-DEF terms permit MedGemma's use in *this* Australian clinical-decision-support context, and whether adding a second clinical generative model changes the system's **TGA SaMD intended-use / risk profile** (it plausibly does — `<regulatory_posture>` says flag it). Until you clear this, the adapter stays **mock / SAFE_STUB and never connects live** — identical posture to every other input-gated external capability in the repo.

---

## 3. Scope boundary — TEXT generation only; imaging/DICOM/CT is OUT

You highlighted MedGemma's image/CT strengths. Those capabilities **cannot be used here**, and this is a hard architectural limit, not a gap to fill later:

- The trunk LLM sees **only the ContextPacket** — there is no image in it. Feeding a raw scan would breach the packet-only bar.
- Telehealth hard limits forbid ECG/imaging findings without a **receipt-gated** live source; raw images/DICOM never reach a packet.
- So the MedGemma adapter is **text-generation over the packet**, exactly like the Claude adapter. Its multimodal/DICOM features are deliberately unused. (If imaging is ever in scope, that is a separate, receipt-gated, heavily-plan-gated program touching fhir-broker + the parser — not this adapter.)

I'm calling this out because it's the biggest expectation-vs-architecture mismatch in the request: the value MedGemma adds *here* is a clinical-domain text model and a data-residency/self-host option — not imaging.

---

## 4. File structure (additive; mirrors L3)

```
integration/
  llm-adapter-medgemma.js     # NEW — same contract as llm-adapter.js:
                              #   generateCandidate({packet, trunk_id}, {client?})
                              #   makeGenerator(trunkId, opts)
                              #   isMedgemmaLiveEnabled()
  generation-backend.js       # NEW (small) — backend selection + A1 availability
                              #   fallback; refusals NEVER rerouted (Decision A)
test/
  contract-llm-adapter-medgemma.js   # NEW — mirrors contract-llm-adapter.js
  contract-generation-backend.js     # NEW — selection + availability-fallback +
                                     #   "refusal is not rerouted" proof
integration/harvest-manifest.json    # +1 REFERENCE row (MedGemma HAI-DEF licence)
```

**Touch-points (all additive):** `package.json` test line; register/gap/CHANGELOG/index. **Frozen, untouched:** `verifier.js`, `portal/verification-gate.js`, `audit-store.js`, `pipeline.js` generation seam (already generic — no change needed), the Claude adapter.

---

## 5. Adapter behaviour (identical bars to L3)

- **Packet-only bar:** re-gate through strict `validateContextPacket`; serialise exactly the parsed object; smuggled field → refuse before transport (spy-proven).
- **Transport:** endpoint-agnostic **first-party HTTPS** to `HEYDOC_MEDGEMMA_ENDPOINT` (works for Vertex AI, HAI-DEF hosted, self-hosted vLLM/TGI, or HF inference — the operator points it wherever). **No heavy SDK dependency** (`@google-cloud/aiplatform` avoided unless Vertex-native auth is later required — that would be its own Phase-2 dependency decision). Key via the fail-closed secrets seam (`integration/secrets.js`; placeholders refuse).
- **Fail-closed:** invalid packet, missing endpoint/key, HTTP error, timeout, empty output, truncation, and any model-side refusal signal → `BLOCKED_NO_PROOF`. Bounded retries only (no loop).
- **Mock by default:** live requires `HEYDOC_MEDGEMMA_LIVE` + resolvable key; mock draft is deterministic and audited `mode:"mock"` — never presented as live.
- **Audit:** `model` (e.g. `medgemma-1.5-4b-it` or the served id), `prompt_sha256`, `mode`, `latency_ms`, `backend:"medgemma"` on the pipeline result's generation channel.
- **Same downstream gate:** output → frozen verifier + detectors + PPP-TTT; a dose-leaking MedGemma draft is blocked exactly as a Claude one. Never sets `patient_eligible`.

---

## 6. Verification (per milestone)

1. `contract-llm-adapter-medgemma.js` — packet-only refusal, all fail-closed paths, mock-by-default, audit shape, dose-leak blocked by the composed gate (mirrors the L3 suite, fake transport — no live call).
2. `contract-generation-backend.js` — backend selection by env; **availability failure → fallback fires**; **refusal → NOT rerouted, stays BLOCKED** (the load-bearing safety test for Decision A1); both backends absent → BLOCKED.
3. All existing gates stay green; frozen core byte-unchanged (existing CI sha256 pin covers it).

## 7. Register / gap impact

- New: `medgemma-generation-backend` (PARTIAL — mock/SAFE_STUB built + contract-proven; live connect + licence/regulatory clearance input-gated). Risk **High**, `blocks_patient_facing:false` (mock), promotes to gap-register.
- New flag: `medgemma-licence-regulatory-clearance` (operator+specialist decision; **Critical/org**, mirrors `regulatory-classification-undecided`). Manifest REFERENCE row cross-linked.
- No `BLIND_STUB`/`DEAD_END` opened (adapter is a producer with a contract-test consumer; live path fail-safe-absent).

## 8. What this plan will NOT do

No Google code or weights in the repo; no live connection until licence+regulatory clearance; no imaging/DICOM path; no refusal-reroute unless you pick A2 and sign off its risk; no new heavy dependency without a separate gate; no weakening of any bar; frozen core untouched; nothing sets `patient_eligible`.

## 9. Execution order (post-approval)

1. **Phase-1 confirm (research):** WebFetch the licence (HF model card) + the API/endpoint shape (get-started + cloud blog) to pin the exact request/response contract and the served model id. **GATE if the licence status is anything other than clearly permissible for this use.**
2. Manifest REFERENCE row + register items.
3. `llm-adapter-medgemma.js` (mock + fail-closed) + its contract test.
4. `generation-backend.js` (selection + A1 availability fallback) + its contract test.
5. Green all gates; update registers/CHANGELOG/index. **GATE.**
6. (Later, operator-gated) staging live smoke against a real MedGemma endpoint — synthetic packets only.
