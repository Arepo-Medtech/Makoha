# HeyDoc MCP servers

Implementations (stub/mock) for the grounding MCP stack. Run from repo root after `npm install`.

## docs

Static documentation server. Tools: `docs_search`, `docs_get`, `docs_cite`.  
Modes: `mock` | `dry_run` | `live`.

```bash
node mcp/servers/docs/index.js
```

Env: `HEYDOC_MODE_DEFAULT`, `HEYDOC_DOCS_DIR`, `HEYDOC_DOCS_INDEX_DIR`.

## identity-au

AU identity + IHI stub. Tools: `identity_verify`, `identity_lookup_ihi`, `identity_log_consent`.  
Modes: `mock` | `dry_run` | `live`.

```bash
node mcp/servers/identity-au/index.js
```

Env: `HEYDOC_MODE_DEFAULT`, `AU_IHI_PROVIDER`, `AU_IHI_ENDPOINT`.

## terminology

SNOMED CT / ICD-11 stub. Tools: `terminology_lookup`, `terminology_validate`, `terminology_map`.  
Modes: `mock` | `dry_run` | `live`. Stub for code lookups (no invented codes). Tools: `terminology_lookup`, `terminology_validate`, `terminology_map`.

```bash
node mcp/servers/terminology/index.js
```

Env: `HEYDOC_MODE_DEFAULT`, `TERMINOLOGY_UPSTREAM_NAME`.

## Contract tests

From repo root:

```bash
npm test
# or
node test/contract-docs.js
node test/contract-identity-au.js
node test/contract-terminology.js
```

Tests spawn each server, send MCP `initialize` and `tools/list` / `tools/call`, and assert responses include receipts with `request_id`, `timestamp_utc`, `upstream`, `mode`.
