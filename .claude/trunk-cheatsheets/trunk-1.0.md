# Trunk 1.0 — Master intake and safety gate
Purpose: first-pass intake normalisation and safety gate; route the session to downstream trunks; catch immediate red flags before any downstream work.
Output contract keys: intake_summary · safety_gate {status: clear|escalate_now|blocked_incomplete, reasons[], danger_signs[] (required on escalate_now: {sign, status: present|inferred|unknown, evidence_ref})} · routing_plan {next_trunks[], why} · missing_inputs[] · evidence_refs[]
Output FORMAT: one JSON object only (```json fence ok) — NO Markdown headings/prose restating fields. A non-JSON answer fails verification and the harness resolves it to INCOMPLETE, never T0 (M0.1/M0.2, 2026-07-23 — the Phase-D canary's dead-canary root cause was Trunk 1.0 emitting Markdown prose).
Forbidden: history enrichment; producing routing_plan.next_trunks before safety_gate is complete; routing at all when blocked_incomplete. (+ universal: no diagnosis, no dosages, no invented codes/operations/service names.)
May consume: docs citations + receipts for any non-obvious claim. Mints no codes, identity, or pharmacology facts.
Fail-safe status: blocked_incomplete → list missing_inputs and stop, no routing_plan. escalate_now immediately when a high-acuity danger sign is PRESENT (not merely un-excludable) — and NAME it in danger_signs (status:present); the absence of remote vitals/labs is NOT itself grounds to escalate — route onward (2.0/3.0/9.0) with conservative safety-netting. (Reworded 2026-07-21 to de-bias intake over-escalation; present-stigmata philosophy. Phase A 2026-07-22: escalate_now now carries structured danger_signs[] — the SHOW-demonstrable-harm articulation burden; an escalate_now with no present sign is interrogated downstream by PPP-TTT (verification/ppp-ttt/intake-concern.js) and resolved to CAUTION, never a reflexive 000. Fail-safe: a present danger sign STILL escalates; an un-interrogable escalation (danger_signs absent/malformed) is HONOURED, never downgraded. Content-not-word: thunderclap worst-ever headache IS present→escalate; "worst" pain otherwise-well is not. Positional calibration (2026-07-23): near-syncope/palpitations that RESOLVE on lying/sitting = orthostatic intolerance (POTS/postural hypotension) → clear/route to triage, NOT escalate; a present danger sign requires it NOT resolving, or ongoing chest pain/breathlessness-at-rest/altered consciousness. "Rapid deterioration" needs an OBJECTIVE finding deteriorating, not patient-reported "worse.")
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention, hard_stop_enforcement.
Literal constraints (TRUNK_CONSTRAINTS): ["no diagnosis","no dosages","initial routing and safety gate only"]
  (CORRECTED 2026-07-15/R3: this read "triage only" — T2.0's constraint, copy-pasted. The source
  (trunk-constraints.md: "Initial routing and safety gate only — no history enrichment") and the prompt were
  both correct; the derived file was the defect, per the <context_loading> maintenance rule.)

Mechanical vs conventional (R1): the `Verifier checks that apply` line above is the COMPLETE set of
automated bars on this trunk. The `Literal constraints` are NOT mechanically enforced — no check inspects
output shape for a diagnosis or a dose (`overconfident_diagnosis` catches a boast, not the act;
`advisory_dose_leak` catches a dose in advisory framing only). They are real obligations, honestly
labelled. Register: `trunk-constraint-claims-unenforced`.
Routing: selects routing_plan.next_trunks. Short-circuit 1.0 → 9.0 when red-flag escalation is needed.
