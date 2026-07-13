# CONSENT-PLAN.md — FL-01 · Consent capture (LIVE_PLAN L12 / `consent-capture-unbuilt` / R-40)

**Status:** ⛳ APPROVED as-is by the operator 2026-07-13 (both defaults accepted: v1 type scope = `session_persistence` + record-only `mhr_data_sharing`/`telehealth_consent`; fourth-chain WORM registration included now). Execution commenced same day on branch `feat/l12-consent-capture`.
**Author role:** Breath-Ezy AI Architect.
**Baseline:** `main @ a1f3742` (PRs #1–#48 merged).
**Tracker:** `.planning/FINISH-LINE.md` FL-01. Register: `consent-capture-unbuilt` (UNBUILT, High, pf:true) → R-40.

> **Not legal, clinical, or regulatory advice.** The APP mapping doc flags org decisions; it does not make them.

---

## Design stance

Consent capture is a **recording mechanism, not a permission unlock**. This build lets a patient grant, decline, or revoke narrowly-scoped consents in-session, records each decision on an append-only hash-chained, PHI-free store (with its durable-storage substrate seam built on day one — the R-43 lesson), and installs the fail-closed `requireActiveConsent()` seam every *future* persistence path must call. It deliberately does **not** open any persistence: `persistContent()` stays synthetic-only, session-store still destroys on close, and declining consent never affects care. The LLM never sees any of it.

## Topology impact

- **Trunks / pipeline steps:** none. ContextPacket byte-identical with or without consent records — contract-tested.
- **Schemas:** one NEW (`consent-record`), zero changed. **Servers:** none.
- **Stores/seams:** NEW consent store (fourth hash chain) + `registerConsentStoreSubstrate()` seam; one-line extension to `registerWormAudit()`; additive session-close hook.
- **Trust boundaries:** strengthens #4 (records carry `session_ref` only — never demographics/IHI) and #5 (consent decisions become retrievable evidence).

## Contracts

NEW `mcp/schemas/consent-record.schema.json` + zod mirror `verification/consent-schema.js` (`.strict()`, PHI-free by construction — enums/IDs/hashes only; no free-text field exists):

```jsonc
{
  "consent_id": "sha256-deterministic (session_ref + type + seq)",
  "session_ref": "encounter-scoped ref only — never demographics/IHI",
  "consent_type": "session_persistence | mhr_data_sharing | telehealth_consent",
  "type_source": "heydoc-first-party | omnibus",
  "omnibus_binding": { "path": "…au_consent_types.<type>", "receipt": "omnibusDatasetReceipt()" },  // provenPath(), never minted; null for first-party
  "status": "proposed | active | rejected | inactive",
  "scope": "patient-privacy | treatment",
  "provision_actions": ["collect","use","destroy"],
  "policy_rule": "OPTIN",
  "method": "patient_attested_in_session",
  "granted_utc": "…", "expires": "session_end",
  "mode": "normaliseMode() — no new mock-as-live seam",
  "record_sha256": "hash of canonical record"
}
```

v1 scope: `session_persistence` (first-party) + `mhr_data_sharing`/`telehealth_consent` (omnibus-bound, **record-only** — nothing acts on MHR; no MHR integration exists). All other omnibus `au_consent_types` out of scope v1 (clinical-document consents, not product consents).

## File paths

| Action | Path |
|---|---|
| NEW | `mcp/schemas/consent-record.schema.json` |
| NEW | `verification/consent-schema.js` |
| NEW | `verification/consent.js` — `captureConsent()`, `getActiveConsent()`, `revokeConsent()`, `requireActiveConsent()` (fail-closed `BLOCKED_NO_CONSENT`) |
| NEW | `verification/consent-store.js` — append-only hash chain `consent-records.jsonl`, `verifyConsentChain()`, `registerConsentStoreSubstrate()` two-op seam day one |
| MODIFY | `integration/audit-substrates/s3-object-lock.js` — fourth chain in `registerWormAudit()` |
| MODIFY | `patient/consult-flow.js` + `patient/consult-server.js` — consent step (bounded, decline-safe, suppressed on emergency paths, mock-gated) |
| MODIFY | `verification/session-store.js` — additive close hook: consents → `inactive` on `closeEncounter()` |
| NEW | `test/contract-consent.js` (wired into `npm test` + CI) |
| NEW | `docs/grounding/privacy-app-mapping.md` — APP 1–13 mechanism map + data-flow register; org items flagged, not decided |
| MODIFY | registers, CHANGELOG, `.claude/completeness-index.md`, `.claude/schema-index.md`, FINISH-LINE FL-01 |

## Phases & verification

- **P1 Contract lock** — schema + zod + omnibus bindings via `provenPath()` (spoiler gate applies). Verify: fixture round-trip; receipt attached; free text impossible. GATE ✅ (operator pre-approved through).
- **P2 Core + store** — consent.js + consent-store.js (chain + seam) + session close hook. Verify: capture→revoke round-trip; tamper detection; `requireActiveConsent` default-deny on every branch (no record / rejected / inactive / expired / unknown type / malformed); frozen pins hold. GATE ✅.
- **P3 Surface + WORM + tests** — consult-flow step; fourth-chain WORM registration; `contract-consent.js` incl. **packet byte-identity** and **no-unlock assertion** (`persistContent` still refuses non-synthetic even with active consent). Verify: full suite + verification + trunk stubs green. GATE ✅.
- **P4 Docs + register close** — APP mapping; `consent-capture-unbuilt` → resolved; R-40 capture-half resolved (pen-test/APP org halves remain → FL-51); CHANGELOG; scoped re-scan; finish-line agent pass for FL-01.

## Invariant check

No packet change · no persistence opened (`persistContent` synthetic-only untouched; destroy-on-close untouched) · patient-data minimisation (session_ref + enums + hashes only) · no codes minted (omnibus receipt-proven) · RETAIN core byte-unchanged (new sibling store; `audit-store.js` never edited) · fail-safe default everywhere (`BLOCKED_NO_CONSENT`) · consent capture suppressed on STOP/T5 emergency paths — never a barrier to care.

## Register / gap impact

Closes `consent-capture-unbuilt`; R-40 capture half resolved. Opens nothing (seam ships with the store). `content-store-production-gated` explicitly stays open.

## New dependencies

None.
