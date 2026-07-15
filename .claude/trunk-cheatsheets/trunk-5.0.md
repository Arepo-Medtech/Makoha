# Trunk 5.0 — Axis B deterministic rule-out
Purpose: translate the problem representation into an Axis B rule-out matrix — required negatives/confirmations to establish before progressing toward management; surface blocking gaps.
Output contract keys: axis_b_ruleout_matrix {required_negatives[status: confirmed|unknown], required_confirmations[status], required_evidence[]} · blocking_gaps[] · next_data_requests[] · evidence_refs[]
Forbidden: building matrices from memory; inferring a negative; diagnosis; dosages.
May consume: knowledge MCP structured dataset `axis-b-templates` (required); receipts.
Fail-safe status: if `axis-b-templates` is absent from the ContextPacket → output `blocked_no_templates`. Any required negative that is `unknown` is a blocking gap, never a safe assumption.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","Axis B rule-out per template"]

Mechanical vs conventional (R1): the `Verifier checks that apply` line above is the COMPLETE set of
automated bars on this trunk. The `Literal constraints` are NOT mechanically enforced — no check inspects
output shape for a diagnosis or a dose (`overconfident_diagnosis` catches a boast, not the act;
`advisory_dose_leak` catches a dose in advisory framing only). They are real obligations, honestly
labelled. Register: `trunk-constraint-claims-unenforced`.

