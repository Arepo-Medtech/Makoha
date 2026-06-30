# Trunk ↔ grounding integration

Trunk agents should send all turns through the grounding pipeline and verification layer so that outputs are auditable and non-hallucinatory.

## Usage from a Trunk agent

1. **System prompt**: Load the trunk system prompt you are running (e.g. Trunk 1.0) when building the LLM context:

```js
import { getTrunkSystemPrompt, runTrunkWithGrounding } from "../integration/trunk-pipeline.js";

const systemPrompt = getTrunkSystemPrompt("1.0");  // reads trunk/prompts/trunk-1.0-system.md
// Use systemPrompt as the system message for your LLM; then run generation and pass output to runTrunkWithGrounding.
```

2. **After generating a reply** (or before submitting it), call:

```js
import { runTrunkWithGrounding } from "../integration/trunk-pipeline.js";

const { pass, report, verification } = runTrunkWithGrounding(
  "2.0",                    // trunk id
  "Patient reports lower back pain.",
  {
    candidateOutput: llmResponseText,
    sessionRef: encounterId,
    writeArtifacts: true,    // writes verification/report.json and evidence_tree.md
    useMcp: true,            // optional: use live docs + identity-au MCP retrieval (or set HEYDOC_USE_MCP=1)
  }
);

if (!pass) {
  // Block or flag: report.missing_receipts, verification.results
}
```

3. **Routing and retrieval** are still stubbed in `verification/pipeline.js`. To wire real MCP:
   - In your agent, call MCP tools (docs, identity-au, terminology, etc.) according to the plan from `runPipeline` (or a trunk-aware router).
   - Build the context packet with the returned receipts and citation IDs.
   - Pass that evidence into verification: use `verifyTrunkOutput(output, { citations, terminology_receipts, live_receipts })` or keep using `runTrunkWithGrounding` once the pipeline uses live MCP.

4. **Trunk-specific constraints** are in `integration/trunk-pipeline.js` (`TRUNK_CONSTRAINTS`). Add or change constraints there as trunks are implemented.

## Trunk stubs

Minimal stubs that run one turn through the pipeline and write verification artifacts:

- **Trunk 1.0** (master/originating): `trunk/trunk-1.0-stub-agent.js` — `npm run trunk:stub:1` (alias: `npm run trunk:stub`)
- **Trunk 2.0** (triage): `trunk/stub-agent.js` — `npm run trunk:stub:2`
- **Trunk 3.0** (history enrichment): `trunk/trunk-3.0-stub-agent.js` — `npm run trunk:stub:3`
- **Trunk 4.0** (problem representation): `trunk/trunk-4.0-stub-agent.js` — `npm run trunk:stub:4`
- **Trunk 5.0** (Axis B rule-out framing): `trunk/trunk-5.0-stub-agent.js` — `npm run trunk:stub:5`
- **Trunk 6.0** (investigation interpretation): `trunk/trunk-6.0-stub-agent.js` — `npm run trunk:stub:6`
- **Trunk 7.0** (code lock-in): `trunk/trunk-7.0-stub-agent.js` — `npm run trunk:stub:7`
- **Trunk 8.0** (pharmacology firewall): `trunk/trunk-8.0-stub-agent.js` — `npm run trunk:stub:8`
- **Trunk 9.0** (red-flag questionnaire): `trunk/trunk-9.0-stub-agent.js` — `npm run trunk:stub:9`

Run all: `npm run trunk:stub:all`. CI runs `trunk:stub:all` after contract tests and verification.
