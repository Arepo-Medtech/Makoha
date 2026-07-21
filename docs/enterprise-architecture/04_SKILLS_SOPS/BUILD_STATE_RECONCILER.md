# S-M008 — Build-State Reconciler

**Status:** DRAFT  
**Owner:** Product / Engineering / Clinical governance  
**Trigger:** A venture roadmap, phase plan or external claim must be aligned to a fast-moving regulated-software repository.

## Purpose

Produce an evidence-bounded architecture digest and an ordered build sequence without mistaking stale handoff prose, passing unit tests or deployed infrastructure for clinical release readiness.

## Procedure

1. Resolve the live default-branch commit and record the observation time.
2. Read the repository charter, handoff, current registers, change log, build plans and release tracker.
3. Compare tracker baselines with live HEAD and record every material drift.
4. Run the applicable deterministic control suite in the repository's required runtime; disclose any runtime difference.
5. Classify each component as built, partial, input-gated, dependency-gated or release-blocked.
6. Name proof boundaries: what each passing control does and does not establish.
7. Order the next three increments by dependency and safety-risk retirement.
8. For each increment, state outcome, exit evidence, blocking inputs, hard gates and stop conditions.
9. Update the venture decision, gap, artefact, source and status registers.
10. End with one executable next action that cannot silently widen patient eligibility.

## Mandatory rules

- Live code and current mechanical evidence outrank stale summaries.
- A skipped gate is never a pass.
- A mock or synthetic result is never represented as live clinical validation.
- A deployed service is not release-ready merely because its health endpoint responds.
- Do not weaken safety thresholds to make a build green.
- Do not treat engineering controls as regulatory approval, enterprise QMS completion or operator release authorisation.
- Keep patient eligibility false unless every applicable gate has current evidence.

## Minimum output

- commit-stamped architecture digest;
- verification snapshot;
- source conflicts;
- ordered next-three-increment table;
- gate and stop-condition list;
- register updates;
- one next action.
