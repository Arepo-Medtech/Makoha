## Trust boundaries (what can assert what)

The briefing repeatedly calls for “firewalls” between probabilistic generation and deterministic medical logic. This file expresses that as explicit trust boundaries.

### Boundary 1: LLM output vs. deterministic truth
- **LLM may**: summarize, ask questions, format payloads, perform routing logic on *provided* facts.
- **LLM must not**: mint codes, invent lab values, claim guidelines, claim identity verification, or assert external operational status.

### Boundary 2: Static documentation vs. operational facts
- **Static docs** justify *why* a rule exists (“Choosing Wisely recommends …”) but do not provide patient-specific facts.
- **Operational facts** (IHI, SNOMED codes, results, delivery) must be tool-derived receipts.

### Boundary 3: Structured knowledge vs. live APIs
- Structured registries/templates are **versioned datasets** used for consistent behavior.
- Live APIs provide **current state** and must be recorded with receipts.

### Boundary 4: Patient-identifying data minimization
- AU identifiers (IHI) are handled only in the identity boundary; all downstream trunks should use encounter-scoped references and receipts, not demographics.

### Boundary 5: Auditability
- Every critical decision point must produce EvidenceNodes tying the decision to receipts/citations.

