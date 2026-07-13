# HYGIENE-FL03-PLAN.md — FL-03 · Low-risk hygiene batch

**Status:** ⛳ EXECUTED 2026-07-13. Branch `feat/fl03-hygiene`. Baseline `main @ 3519a00`.
**Tracker:** FINISH-LINE FL-03 (last W0 no-external-input item). Done-when: *eval:cases shows 0 named exemptions; fixture test green.*

## Scope (three sub-items)

1. **Reference-case manifest retrofit** (`reference-case-manifest-missing`, Low) — the hand-built reference case `SPEC-CARD-04-00001` predates `cases:ingest` and has no `case_manifest.json`, so it was a NAMED exemption in `eval:cases` + `verify-case-codes`.
2. **Repo-digest default-deny fixture** (`repo-digest-sealed-node-carveout`, Low) — the engineering digest deliberately embeds the reference case's sealed 10–13 nodes; add a test proving the M3 allow-list rejects any digest-injection shape.
3. **F1 verifier fuzz suite** — explicitly OPTIONAL; not in the done-when.

## Decisions

- **Attestation (fail-safe):** the reference case's envelope records `provenance.clinician_reviewed:true` (KL, 2026-06-23), but the retrofit sets the *manifest* `clinician_reviewed:false` and records the envelope review as a note. Rationale: do NOT move the release-gate attested count (stays 301) as a side effect of a hygiene item; admitting it to the trusted set is an explicit operator attestation (one-flag flip → 302). This also avoids fabricating a manifest attestation.
- **Retrofit method:** a dedicated firewall-safe script (`scripts/retrofit-reference-manifest.mjs`) that hashes on-disk bytes only — chosen over a `casebundle → cases:ingest` round-trip, which would re-canonicalise (mutating the reference bytes) and risk reseq. Sealed 10–13 are streamed through sha256, never parsed/routed. `codes_manifest` left empty (reference case excluded from code-verification + attested sets; re-manifesting would require parsing node 10).
- **F1 fuzz deferred:** optional, out of the done-when; noted in the tracker rather than expanding scope.

## Changes

| File | Action |
|---|---|
| `scripts/retrofit-reference-manifest.mjs` | NEW — firewall-safe manifest generator |
| `data/cases/SPEC-CARD-04-00001/case_manifest.json` | NEW — generated (fail-safe reviewed:false) |
| `scripts/eval-case-gate.mjs` | ~ — removed `LEGACY_EXEMPT` + exemption branch (missing manifest now a hard failure) |
| `test/contract-context-allowlist.js` | ~ — digest-shaped default-deny fixture block (synthetic; 3 threat shapes; zero sealed leakage) |

## Verification (done-when + regression)

- `eval:cases` → **named exemptions: 0** (301 attested, 2 unreviewed, PASS). ✔
- `verify-case-codes` legacy-skipped: 0 (ref case now processed, empty codes → nothing to verify). ✔
- `test/contract-context-allowlist.js` green with the digest fixtures. ✔
- `npm test` EXIT 0 · `verification` Pass:true · `bench:mirage` OK · `licence:check` + `security:secrets` PASS. ✔

## Invariant check

Scoring-store firewall preserved + strengthened (byte-hash only; digest carve-out now test-guarded) · no attestation fabricated (fail-safe) · release-gate attested count unchanged (301) · RETAIN core byte-unchanged.

## Register / gap

`reference-case-manifest-missing` → COMPLETE/resolved. `repo-digest-sealed-node-carveout` → COMPLETE/resolved. No new item opened. F1 fuzz deferred (optional).
