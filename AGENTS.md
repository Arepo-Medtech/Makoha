# Makoha repository instructions

## Shared authority

- This Git repository is the durable, shared source of truth for the two-person AREPO Medtech team.
- Start every Makoha Codex task from this repository, not from an account-specific ChatGPT mirror, Finder alias, Downloads folder, or a private chat attachment.
- Read `PROJECT_START_HERE.md` before planning material work.
- Read `docs/enterprise-architecture/01_SOURCE_OF_TRUTH/STATUS_DASHBOARD.md`, `DECISION_LOG.md`, `GAP_REGISTER.md`, and `ARTEFACT_REGISTER.md` before changing strategy, clinical scope, regulatory posture, budgets, or delivery gates.
- Do not silently reconcile conflicting sources. Record the conflict in the gap register and preserve provenance.

## Naming and provenance

- Use **Makoha** in all new user-facing material.
- Historical Breath-Ezy filenames and technical identifiers may remain until deliberately superseded; do not mass-rename them.
- Arepo Medtech Pty Ltd remains the legal-entity name unless verified corporate records say otherwise.

## Clinical and regulatory safety

- Treat the product as regulated clinical decision-support software with a provisional Class III triage posture and Class IIb professional-assurance posture pending formal counsel confirmation.
- Fail closed where required evidence, identity, authority, provenance, evaluation, or release approval is absent.
- Never represent provisional classification, clinical validation, pilot readiness, patient eligibility, or regulatory approval as completed.
- Do not place secrets, identifiable patient information, production credentials, or unapproved clinical data in the repository.

## Working agreement

- One outcome per branch and pull request.
- Pull before starting; branch from the current agreed base; do not work directly on `main`.
- Use descriptive branch names such as `docs/pharmacy-777-offer` or `feature/portal-identity`.
- Update the relevant source-of-truth register in the same change as any material decision or deliverable.
- Do not overwrite another contributor's work. Surface overlaps or contradictions before editing them.
- Commit coherent changes with plain-language messages; use pull-request review for acceptance into the shared record.

## Verification

- Documentation-only changes: check links, filenames, register consistency, terminology, and `git diff --check`.
- Code or schema changes: run the narrowest relevant package tests, then broader tests in proportion to risk.
- Before clinical release or authoritative evaluation, follow the gates in the status dashboard and applicable verification procedures; a local test pass is not clinical or regulatory approval.

## Completion standard

A task is complete only when the requested artefact or code exists, relevant checks pass, source-of-truth registers are updated when needed, unresolved assumptions are explicit, and the change is ready for review through GitHub.

