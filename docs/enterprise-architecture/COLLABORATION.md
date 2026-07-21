# Two-Person Collaboration Operating Model

## Purpose

This operating model gives both AREPO Medtech accounts access to the same Makoha context without requiring every private ChatGPT conversation to be visible.

## The three shared layers

1. **GitHub repository — authoritative record.** Code, controlled Markdown, registers, reviewed decisions, plans, and non-sensitive generated artefacts live here.
2. **Shared Makoha ChatGPT project — collaborative context.** Both Business seats are invited with edit access. Shared project chats, uploaded reference material, and project instructions support discussion and drafting.
3. **Local working copy — temporary execution surface.** Each contributor clones or opens the same repository. Local changes are shared only after commit, push, and review.

Private chats, account-specific project mirrors, memories, aliases, and local downloads are not canonical sources.

## Roles

- Business workspace owner: manages membership, project sharing, and workspace controls.
- Second Business member: participates through the same shared project and repository.
- Either person may propose work. Material clinical, regulatory, financial, legal, security, or release decisions require explicit review and evidence appropriate to the decision.

## Daily workflow

1. Open the shared Makoha project for common context.
2. Open the local `Makoha` Git repository for file work.
3. Pull, create a narrowly named branch, and use one chat per outcome.
4. Record material decisions and gaps as part of the same change.
5. Run relevant checks, commit, push, and open a pull request.
6. The other person reviews the pull request before merge.
7. After merge, both local copies pull the accepted version.

## Chat discipline

- Use descriptive chats such as `P2.2 — identity integration`, `777 Pharmacy — outreach pack`, or `QMS — design controls`.
- A chat may explore alternatives, but accepted outcomes must be written into repository files.
- Start a new chat when the outcome changes. Link the relevant decision, issue, branch, or pull request in the first message.
- Do not treat model memory as the only record of a requirement.

## Change-control minimum

Every material change should identify:

- purpose and owner;
- files or systems affected;
- evidence and assumptions;
- clinical/regulatory/security impact;
- verification performed;
- unresolved gaps; and
- reviewer/acceptance status.

## Account-specific legacy record

The initial enterprise-architecture documents were generated in an account-specific ChatGPT project mirror. They were copied into this directory on 21 July 2026 so the Git repository could become the shared source. The originating files were retained unchanged for provenance. Future controlled changes belong here and should flow through Git review.

