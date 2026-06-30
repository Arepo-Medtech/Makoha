# Trunk system prompts

System prompts for each Trunk agent. Load via `getTrunkSystemPrompt(trunkId)` from the integration layer when building the LLM context.

- **trunk-1.0-system.md** — Master/originating intake routing and safety gate; no diagnosis, no dosages; evidence-bound escalation logic.
- **trunk-2.0-system.md** — Triage only; no diagnosis, no dosages; guideline claims must cite injected evidence.
- **trunk-3.0-system.md** — Structured history enrichment only; no diagnosis, no dosages; unknowns remain explicit.
- **trunk-4.0-system.md** — Problem representation and risk framing only; no diagnosis, no dosages; uncertainty explicit.
- **trunk-5.0-system.md** — Axis B deterministic rule-out framing; no diagnosis, no dosages; missing proof explicit.
- **trunk-6.0-system.md** — Investigation interpretation only; no diagnosis, no dosages; LOINC-grounded evidence discipline.
- **trunk-7.0-system.md** — Code lock-in only; no diagnosis, no dosages; terminology receipt required for coded output.
- **trunk-8.0-system.md** — Pharmacology firewall intent check; no diagnosis, no dosages; HARD_FAIL/blocked states explicit.
- **trunk-9.0-system.md** — Red-flag questionnaire and escalation gate; no diagnosis, no dosages; unknown/blocked states explicit.
