# Trunk 8.0 — Pharmacology firewall intent check
Purpose: convert clinical intent into a structured PharmIntent safety-check request; gate pipeline continuation on the deterministic firewall outcome. The ONLY trunk that touches the pharmacology server.
Output contract keys: pharm_intent_payload (PharmIntent — see mcp/schemas/pharm-intent.schema.json) · firewall_status: PASS|WARN|HARD_FAIL|BLOCKED_NO_PROOF · blocking_reasons[] (required for HARD_FAIL / BLOCKED_NO_PROOF) · next_data_requests[] · evidence_refs[]
Forbidden: any dose value in the payload (drug identity, class, route only — doses are output of pharm.check, never input from the LLM); autonomous prescribing; overriding a HARD_FAIL; inventing allergy/interaction/renal facts.
May consume: mcp-pharmacology PharmCheck output (the sole source of dose guidance); receipts for any drug fact; ContextPacket facts (allergy status, current meds, renal function).
Fail-safe status: HARD_FAIL → pipeline halts, no override path. BLOCKED_NO_PROOF when allergy/meds/renal facts are absent. Schedule 8 (S8) intent without a documented SafeScript WA PDMP check → HARD_FAIL.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention, hard_stop_enforcement (critical).
Literal constraints: ["no diagnosis","no dosages","no autonomous prescribing","pharmacology firewall HARD_FAIL blocks"]

Mechanical vs conventional (R1): the `Verifier checks that apply` line above is the COMPLETE set of
automated bars on this trunk. The `Literal constraints` are NOT mechanically enforced — no check inspects
output shape for a diagnosis or a dose (`overconfident_diagnosis` catches a boast, not the act;
`advisory_dose_leak` catches a dose in advisory framing only). They are real obligations, honestly
labelled. Register: `trunk-constraint-claims-unenforced`.

Note: pharmacology server is an unbuilt CRITICAL gap — runs on mock data only; must not reach patient-facing use until a live vendor is connected and validated.
