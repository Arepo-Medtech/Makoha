# Makoha — Start Here

This repository is the canonical shared working environment for Makoha. It replaces reliance on a single long chat or an account-specific local project folder.

## Where things live

- Product code and technical evidence: repository root and existing engineering directories.
- Enterprise strategy, governance, phase plans, registers, and controlled artefacts: `docs/enterprise-architecture/`.
- Current state and next authorised action: `docs/enterprise-architecture/01_SOURCE_OF_TRUTH/STATUS_DASHBOARD.md`.
- Decisions: `docs/enterprise-architecture/01_SOURCE_OF_TRUTH/DECISION_LOG.md`.
- Open uncertainties and blockers: `docs/enterprise-architecture/01_SOURCE_OF_TRUTH/GAP_REGISTER.md`.
- Deliverable inventory: `docs/enterprise-architecture/01_SOURCE_OF_TRUTH/ARTEFACT_REGISTER.md`.
- Team workflow: `docs/enterprise-architecture/COLLABORATION.md`.

## Start every new task

1. Select the shared **AREPO Medtech** ChatGPT Business workspace.
2. Open the shared Makoha ChatGPT project when the task needs its shared chats or uploaded sources.
3. For any work that changes files, open this Git repository as the Codex local project.
4. Pull the latest accepted changes and create a new branch.
5. Start a new, clearly named chat for one outcome; do not continue the original mega-chat indefinitely.
6. Ask Codex to read `AGENTS.md` and `PROJECT_START_HERE.md`, then state the requested outcome.
7. Finish through a reviewed pull request and update the relevant register.

## Standard kickoff prompt

> Work in the Makoha repository. Read `AGENTS.md`, `PROJECT_START_HERE.md`, and the current source-of-truth dashboard and registers. Treat GitHub as the shared durable record and the shared ChatGPT Makoha project as collaborative context. Work on one outcome in a new branch, preserve provenance, update the relevant register, run proportionate checks, and prepare the result for review. Requested outcome: [describe one outcome].

## Boundary

Chat history is useful context, but it is not the authoritative business record. Any decision or deliverable that must survive accounts, chats, devices, or staff changes must be written into this repository or another formally designated controlled system.

