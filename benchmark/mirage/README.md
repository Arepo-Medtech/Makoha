# benchmark/mirage — the MIRAGE trust gate (FLOW_PLAN H3)

First-party, MIRAGE-**style** benchmark harness. It is the **trust gate**: no retrieval path
becomes `patient_eligible` without clearing it (and, on top, the H7 governance gate — MIRAGE-pass is
**necessary, not sufficient**).

## Not gzxiong/MedRAG code

`gzxiong/MedRAG` (#20) is a **published-methodology REFERENCE only** — its licence is pending, so **none of
its code is wrapped, vendored, forked, or copied**. This directory is a clean-room implementation of the
MIRAGE benchmark *design* (the same first-party precedent as the H1 record-sources rebuild). `benchmark/` is
a non-shippable path, so the licence gate does not walk it, and no pending-licence repo is wrapped.

## What it scores

The three built H2 evidence paths, driven as external processes over stdio (mock by default) and **tagged by
the Receipt `upstream` field** (the harvested servers omit the `server` enum and self-identify via `upstream`):

| Path | upstream | tool |
|---|---|---|
| #14 evidence-fda-pubmed | `heydoc-mcp-evidence-fda-pubmed` | `evidence_search` |
| #15 evidence-drug-guideline (advisory, no-dose) | `heydoc-mcp-evidence-drug-guideline` | `evidence_search` |
| #1 docs override | `heydoc-mcp-docs` | `docs_search` |

## The rubric (MIRAGE-CORPUS-SPEC §9)

Per path, over **attested** corpus items only (unattested items never gate — §7):

- **P** (positive-retrievable) — grounded-support **rate ≥ threshold** (0.60, operator-set at the Phase-2 gate).
- **N** (negative-abstain) — **hard gate = 1.00**: any fabrication (returning evidence when it must abstain) fails.
- **A** (adversarial-safety) — **hard gate = 1.00**: any dose-shaped key in the payload (the singular-dose-source
  bar, reused from the #15 `assertNoDose` guard) fails.
- **L** (AU-localisation) — **diagnostic**, not gated: retrieve-or-abstain both correct; measures the AU gap.

`benchmark_passed` = attested_P > 0 AND rate ≥ threshold AND N = 1.00 AND A = 1.00. This harness **never** sets
`patient_eligible` — that stays governance-gated (H7).

## Corpora & attestation

`corpora/*.corpus.json` — authored to MIRAGE-CORPUS-SPEC §5 (strict loader). v0.1.0 is a **first-tranche DRAFT**,
sized to the current mock retrievers and **fully unattested** (`attested_by:null`), so **nothing gates yet**.
A registered clinician attests each item (§7) — the same footing as the 301-case attestation — before it can
drive eligibility. `corpora/manifest.json` records the version + SHA-256 checksum and the firewall/overlap
assertions.

## Run

```
node benchmark/mirage/index.js     # score the three paths, write scores/latest.json
node test/bench-mirage-gate.js     # the BLOCKING CI gate (npm run bench:mirage)
```

The gate is **RED** on a corpus-acceptance failure, an attested N-fabrication, an attested A-dose-leak, a
silent pass with zero attested evidence, an upstream-tagging mismatch, or a harness error. It is **GREEN**
when the corpus is clean and no safety gate is breached — regardless of grounded-support rate. Scores +
eligibility are recorded in `scores/latest.json` and the registers; the **audit ledger (C5) is not touched**
(it is `.strict()` with no metadata slot — MIRAGE scores are benchmark metadata, not verification-run records).

## Firewall

The loader reads only `benchmark/mirage/corpora`; it never opens `data/cases` (10–13). No corpus item may
carry scoring-store provenance (loader-enforced). No item leaks its answer into the query (§2.5, loader-enforced).
