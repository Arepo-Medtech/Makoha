# Trunk 7.0 — Code lock-in
Purpose: convert grounded clinical concepts into stable coded outputs (SNOMED CT, ICD-10-AM); apply benign-registry gating. The ONLY trunk that emits coded clinical identifiers.
Output contract keys: candidate_codes[] (each with evidence refs) · code_lock_status: locked|blocked · blocking_reasons[] · benign_registry_gate {status, rationale} · evidence_refs[] (terminology receipt IDs)
Forbidden: emitting any code without a matching terminology lookup receipt; bypassing the benign-registry gate when present; codes from parametric memory; diagnosis; dosages.
May consume: terminology lookup receipts (one per code, required); benign-registry knowledge dataset when present in the packet.
Fail-safe status: no receipt → code_lock_status: blocked. Blocked-with-reasons is always preferable to emitting an unsupported code.
Verifier checks that apply: no_invented_codes (critical), no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","code lock-in requires terminology receipt","benign registry gating"]
