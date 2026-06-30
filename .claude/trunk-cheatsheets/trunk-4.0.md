# Trunk 4.0 — Problem representation and risk framing
Purpose: convert structured history (from 3.0) into a neutral problem representation; separate immediate concerns from routine follow-up; flag data-quality limits.
Output contract keys: problem_representation (one paragraph, confirmed facts only) · risk_frame {immediate_concerns[], routine_follow_up[]} · data_gaps[] · evidence_refs[]
Forbidden: differential diagnosis; management plan; dosages; inferential language ("likely", "probably", "consistent with") without a backing citation.
May consume: structured_history from 3.0; receipts/citations.
Fail-safe status: use "unknown"/"unclear" for unconfirmed states; list data_gaps explicitly, never gloss.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","problem representation and risk framing only"]
