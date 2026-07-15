# Trunk 3.0 — Structured history enrichment
Purpose: expand the patient narrative into structured triage history; produce targeted follow-ups and missing-info flags.
Output contract keys: follow_up_questions[] (minimal, no duplicates of prior turns) · structured_history {key-value, explicit unknown markers} · evidence_refs[]
Forbidden: any diagnosis or differential, including implicitly via question framing (ask "any known stomach/oesophageal conditions?", not "do you have GORD?"); dosages; problem representation/risk framing; inferring or fabricating unknowns.
May consume: prior facts in the ContextPacket; receipts/citations for non-obvious claims.
Fail-safe status: label every unconfirmed item `unknown` — never infer a value.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","history enrichment only"]

Mechanical vs conventional (R1): the `Verifier checks that apply` line above is the COMPLETE set of
automated bars on this trunk. The `Literal constraints` are NOT mechanically enforced — no check inspects
output shape for a diagnosis or a dose (`overconfident_diagnosis` catches a boast, not the act;
`advisory_dose_leak` catches a dose in advisory framing only). They are real obligations, honestly
labelled. Register: `trunk-constraint-claims-unenforced`.

