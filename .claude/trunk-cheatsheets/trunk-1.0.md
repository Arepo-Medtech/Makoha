# Trunk 1.0 — Master intake and safety gate
Purpose: first-pass intake normalisation and safety gate; route the session to downstream trunks; catch immediate red flags before any downstream work.
Output contract keys: intake_summary · safety_gate {status: clear|escalate_now|blocked_incomplete, reasons[]} · routing_plan {next_trunks[], why} · missing_inputs[] · evidence_refs[]
Forbidden: history enrichment; producing routing_plan.next_trunks before safety_gate is complete; routing at all when blocked_incomplete. (+ universal: no diagnosis, no dosages, no invented codes/operations/service names.)
May consume: docs citations + receipts for any non-obvious claim. Mints no codes, identity, or pharmacology facts.
Fail-safe status: blocked_incomplete → list missing_inputs and stop, no routing_plan. escalate_now immediately on any T5 red flag, without waiting for downstream trunks.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention, hard_stop_enforcement.
Literal constraints (TRUNK_CONSTRAINTS): ["no diagnosis","no dosages","triage only"]
Routing: selects routing_plan.next_trunks. Short-circuit 1.0 → 9.0 when red-flag escalation is needed.
