# Trunk 6.0 — Investigation interpretation
Purpose: interpret already-sanitised investigation summaries from the ContextPacket; classify findings by urgency; flag escalation. Does not order or request investigations.
Output contract keys: finding_summary {critical[], abnormal_noncritical[], normal_or_expected[], insufficient_data[]} · escalation_signal {requires_urgent_escalation: bool, reason} · next_data_requests[] · evidence_refs[]
Forbidden: ordering/requesting investigations; management plan; reproducing raw numeric lab values; fabricating results not in the packet; any lab code without a LOINC receipt.
May consume: sanitised investigation summaries (work only with the `sanitised_by` form); terminology LOINC receipts.
Fail-safe status: use `insufficient_data` for any result not present in the ContextPacket; never infer a missing result.
Verifier checks that apply: no_invented_codes, no_invented_guidelines, no_invented_operations, no_repo_invention.
Literal constraints: ["no diagnosis","no dosages","investigation interpretation only","LOINC-derived"]
