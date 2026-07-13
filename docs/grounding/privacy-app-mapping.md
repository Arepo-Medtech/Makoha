# Privacy Act 1988 (Cth) — APP mapping & data-flow register

**Document ID:** `heydoc-grounding:privacy-app-mapping:2026-07`
**Version:** 1.0.0 · Generated 2026-07-13 (LIVE_PLAN L12 / FL-01, plan `.planning/CONSENT-PLAN.md`)
**Status:** engineering mapping — maps each Australian Privacy Principle to the mechanism that addresses it (or names the gap/owner). **Not legal advice**; items marked **[ORG]** are operator/specialist decisions this document surfaces, never makes. Formal privacy review + external pen-test are FL-51.

## 1. Data-flow register (what patient data exists, where it flows, what stops it)

| # | Flow | Data | Mechanical control |
|---|---|---|---|
| D1 | Patient intake → pipeline | symptom text (session only) | `session-store` memory-only, destroy-on-close (M4); no disk path exists |
| D2 | Identity verification | IHI, demographics | identity-au boundary ONLY; downstream trunks get encounter-scoped refs; session-store demographic guard REFUSES demographic keys/IHI-shaped values |
| D3 | Pipeline → LLM (Step 4) | bounded ContextPacket, sanitised facts | context-allowlist default-deny; raw lab numbers never injected; consent records NEVER enter the packet (static-scan contract-tested) |
| D4 | Verification → audit ledger | hashes, receipts, check results | PHI-free by `.strict()` schema; append-only hash chain; WORM substrate (R-39) |
| D5 | Clinician gate records | decision, signature ref, bundle hash | gate-record store, durable-first, hash-chained, WORM-coverable |
| D6 | PPP-TTT triage trail | IDs/enums only | PHI-free strict schema; parallel chain; WORM-coverable |
| D7 | Consent events (NEW, L12) | session_ref + enums + omnibus bindings | `consent-store` PHI-free strict schema; append-only chain; WORM-coverable; session-bound expiry mechanical |
| D8 | Exact output text | candidate output bytes | `persistContent()` **synthetic-only** — refuses real content (`content-store-production-gated`) |

**No other persistence path exists.** Any future one MUST call `requireActiveConsent(session_ref, "session_persistence")` (the L12 seam) *and* clear the remaining release blockers — the seam refuses by default.

## 2. APP mapping

| APP | Principle | Mechanism / status |
|---|---|---|
| 1 | Open and transparent management | Consult surface banner states posture on every page; this register documents flows. **[ORG]** public privacy policy document. |
| 2 | Anonymity & pseudonymity | Encounter-scoped refs (`enc-*`) replace identity downstream; consult surface requires no identity in dev. Live identity verification is scoped to identity-au (M9-adjacent). |
| 3 | Collection of solicited personal information | Intake collects the minimum (symptoms, age, interpreter flag); bounded consent choices; nothing collected is retained past session without an active consent (mechanically impossible today). |
| 4 | Unsolicited personal information | Session-store destroys everything on close; nothing unsolicited can persist. |
| 5 | Notification of collection | Consult banner + consent step plain language. **[ORG]** formal collection notice wording. |
| 6 | Use or disclosure | No disclosure paths exist (messaging-geo is never-sends mock, L15 last; MHR consent is RECORD-ONLY — nothing uploads). |
| 7 | Direct marketing | No marketing path exists; none planned. |
| 8 | Cross-border disclosure | **[ORG]** deploy-region decision — current substrate config is ap-southeast-2 (AU); confirm all backends stay in-region at FL-52. |
| 9 | Government identifiers | IHI never leaves the identity-au boundary; IHI-shaped values refused by the session-store guard wherever they appear. |
| 10 | Quality of personal information | Patient-provenance facts carry `verified:false` + source channel (HIST-2 string-preserving policy); nothing patient-stated is presented as verified. |
| 11 | Security of personal information | Fail-closed secrets seam (B3); CI secret-scan blocking; WORM tamper-evident chains; SAST pending operator choice (B4/FL-13); pen-test pending (FL-51). |
| 12 | Access to personal information | Session-bound: there is nothing retained to access today. **[ORG]** access-request procedure required before any consented persistence goes live. |
| 13 | Correction of personal information | As APP 12 — no retained store yet; correction procedure **[ORG]** before consented persistence. |

## 3. My Health Records Act touchpoints

`mhr_data_sharing` consent is **capture-only**: the patient's preference is recorded as evidence; no MHR connection, upload, or read exists anywhere in the tree. Any future MHR integration is a new plan-gated workstream with its own regulatory review — this document flags it, nothing more.

## 4. Open items (owned elsewhere)

- FL-13 SAST in CI (operator tool choice) · FL-51 external pen-test + formal privacy review **[ORG]** · APP 1/5/12/13 org documents **[ORG]** · consented-persistence implementation (blocked behind `requireActiveConsent` + release blockers — deliberately unbuilt).
