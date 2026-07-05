## Trust boundaries (what can assert what)

The briefing repeatedly calls for “firewalls” between probabilistic generation and deterministic medical logic. This file expresses that as explicit trust boundaries.

### Boundary 1: LLM output vs. deterministic truth
- **LLM may**: summarize, ask questions, format payloads, perform routing logic on *provided* facts.
- **LLM must not**: mint codes, invent lab values, claim guidelines, claim identity verification, or assert external operational status.

- **Pharmacology firewall (Trunk 8.0).** Doses originate only from the pharmacology server's PharmCheck. The firewall runs deterministically (`verification/pipeline.js` via `mcp/servers/pharmacology/engine.js`): `firewall_status` gates continuation, and a `HARD_FAIL` blocks continuation **unconditionally — no override path** (`continuation_blocked` is derived purely from `firewall_status`). A HARD_FAIL is receipt-backed so verifier check 5 distinguishes a legitimate firewall hard-stop from an LLM-invented one. (Mock vendor data until a live vendor is connected.)

### Boundary 2: Static documentation vs. operational facts
- **Static docs** justify *why* a rule exists (“Choosing Wisely recommends …”) but do not provide patient-specific facts.
- **Operational facts** (IHI, SNOMED codes, results, delivery) must be tool-derived receipts.

### Boundary 3: Structured knowledge vs. live APIs
- Structured registries/templates are **versioned datasets** used for consistent behavior.
- Live APIs provide **current state** and must be recorded with receipts.

### Boundary 4: Patient-identifying data minimization
- AU identifiers (IHI) are handled only in the identity boundary; all downstream trunks should use encounter-scoped references and receipts, not demographics.
- **Raw lab numbers never reach the LLM.** A raw numeric investigation result must pass through the `deterministic-investigation-parser` (`verification/investigation-parser.js`) before entering a ContextPacket: it becomes an HL7 interpretation + qualitative string with no raw number, tagged `sanitised_by`. The ContextPacket gate (`pipeline-schemas.js`) rejects any `lab_result` fact lacking `sanitised_by` or carrying a numeric value. Reference ranges are DEV/SYNTHETIC-ONLY pending clinical sign-off.

### Boundary 5: Auditability
- Every critical decision point must produce EvidenceNodes tying the decision to receipts/citations.
- Every verification run is recorded to the **append-only, hash-chained medicolegal ledger** (`medicolegal-audit-ledger`, `verification/audit-store.js` → `.heydoc-data/audit-ledger.jsonl`): `candidate_output_hash` (SHA-256) + run/trunk metadata + pass gate + per-check booleans + receipt metadata. The ledger carries **no PHI**; tamper-evidence is the hash-chain (`verifyChain()`), and `verify:rehash` re-verifies stored outputs.
- **Patient-data split:** the exact output text lives only in a separately-governed, content-addressed store that is **synthetic-only** until session-bound persistence + consent are enforced (Boundary 4). `persistContent()` mechanically refuses non-synthetic output.
- **Production substrate (M8/C5):** the chain algorithm sits on a pluggable **substrate seam** (`appendLedgerLine` / `readLedgerLines` / `writeContentOnce` / `readContentByHex`). The built-in `local` substrate is the dev JSONL/filesystem backend (not WORM, not multi-process safe). Production registers a **WORM adapter** (e.g. S3 Object Lock, immudb) via `registerAuditSubstrate()` at deploy — same interface, chain frozen. Fail-safe: selecting a non-`local` substrate (`HEYDOC_AUDIT_SUBSTRATE`) with no adapter registered **refuses to write** (never a non-WORM medicolegal ledger). **Retention** is surfaced by `auditRetentionPolicy()` (`HEYDOC_AUDIT_RETENTION`) as a **minimum-keep `regulatory_posture` decision** — the org sets the period; the ledger is **never auto-deleted** in code, and the append-only/WORM backend forbids early deletion. Encoding a specific retention period, and connecting the live WORM store, are deploy/regulatory steps, not engineering gaps.

