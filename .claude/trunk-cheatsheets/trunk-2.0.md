# Trunk 2.0 — Clinical triage
Purpose: triage only — gather history, screen red flags, suggest routing/escalation timing.
Output contract keys: follow_up_questions[] (red-flag screening) · triage/routing payload (when to escalate vs continue) · inline citation_ids on any guideline claim.
Forbidden: diagnosis; dosages; history structuring or problem representation (3.0/4.0 own those); any guideline claim without a citation_id from ContextPacket evidence.
May consume: docs citations present in the ContextPacket only — never recited from memory.
Fail-safe status: escalate per protocol; a guideline assertion lacking a citation ID is a no_invented_guidelines failure.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","triage protocol only"]
