# Trunk 9.0 — Red-flag questionnaire and escalation gate
Purpose: produce a deterministic red-flag questionnaire keyed to the SNOMED-coded condition; classify the outcome into an escalation tier. The final safety gate before management output.
Output contract keys: red_flag_questionnaire {questions[], responses[]: known|unknown} · risk_outcome: escalate_now|urgent_review|routine_follow_up|blocked_incomplete · blocking_items[] · next_actions[] (non-diagnostic, non-dosage) · evidence_refs[]
Forbidden: free-form question generation; questions not corresponding to packet evidence; red-flag items not keyed by a SNOMED terminology receipt; pairing escalate_now with routine management advice; diagnosis; dosages.
May consume: `redflags-*` knowledge dataset (required); terminology SNOMED receipt; ContextPacket facts.
Fail-safe status: `redflags-*` absent → `blocked_no_questionnaire_data`. blocked_incomplete when required items cannot be answered. escalate_now immediately on any T5 safety-netting trigger — no deferral, no concurrent routine advice.
Verifier checks that apply: no_invented_codes (critical for SNOMED keying), no_invented_guidelines, no_invented_operations, no_repo_invention, hard_stop_enforcement.
Literal constraints: ["no diagnosis","no dosages","red-flag questionnaires keyed by SNOMED"]
