# `.claude/` — derived quick-references

Just-in-time context for the Breath-Ezy AI Doctor engineering agent. **Derived, not authoritative.**
Repository: https://github.com/Arepo-Medtech/Makoha.git (`Arepo-Medtech/Makoha`). Lives at repo root next to `CLAUDE.md`.

> In-code identifiers keep the legacy `heydoc` / `HEYDOC_*` prefix (env vars, `.heydoc-data`, citation IDs). Those are internal and unchanged — only the repository identity is `Arepo-Medtech/Makoha`.
When a file here disagrees with its source, the source wins and the file here is the defect — fix it.

| File | Source of truth |
|---|---|
| `trunk-cheatsheets/trunk-<N>.md` | `docs/grounding/trunk-constraints.md` (`trunk-constraints:v1.0.0:2026-06`) |
| `schema-index.md` | `mcp/schemas/` + `data/schemas/` |
| `server-status.md` | `docs/grounding/gap-register.md` + `docs/grounding/mcp-server-map.md` |

**Load order per task:** trunk cheat-sheet(s) → schema(s) touched → `server-status.md` → implementation files.
**Maintenance:** when you change a schema, trunk contract, or server status, update the matching file here in the same phase.

Universal constraints (apply to every trunk, injected into every `ContextPacket.constraints[]`): no diagnosis · no dosages · no invented codes · no invented operational facts · no invented service names · HARD_FAIL blocks · Australia jurisdiction only.
