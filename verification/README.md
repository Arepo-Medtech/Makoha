# Verification harness

Runs the **5-step grounding pipeline** (routing → retrieval → context injection → generation → verification) and writes:

- **report.json** — machine-readable pass/fail, check results, missing receipts
- **evidence_tree.md** — human-readable claims → proofs

## Usage

From repo root:

```bash
node verification/run.js
```

Optional: pass a path to a candidate output file (e.g. from an LLM) to verify that text instead of the built-in stub:

```bash
node verification/run.js path/to/candidate_output.txt
```

**Live MCP retrieval:** set `HEYDOC_USE_MCP=1` to run retrieval via the docs and identity-au MCP servers instead of stubs. Requires `npm install` and the servers at `mcp/servers/docs` and `mcp/servers/identity-au`.

```bash
HEYDOC_USE_MCP=1 node verification/run.js
```

Exit code: 0 if verification passed, 1 if failed.

## Checks (verifier.js)

1. **No invented codes** — SNOMED/ICD-like references require a terminology receipt.
2. **No invented guidelines** — “Choosing Wisely/eTG says …” requires a docs.cite ID.
3. **No invented operations** — IHI, lab results, pharmacy, delivery require live-data receipts.
4. **No repo/API invention** — Output must not introduce service names outside the gap register.
5. **Hard-stop enforcement** — HARD_FAIL or critical acuity override requires a pharmacology/investigation receipt.

When `HEYDOC_USE_MCP=1`, retrieval uses **live** docs and identity-au MCP servers (`verification/retrieval-mcp.js`). Otherwise retrieval is stubbed. Generation remains stubbed until wired to an LLM.
