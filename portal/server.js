/**
 * portal server — the Clinician Verification Portal review console
 * (LIVE_PLAN L1; gap `clinician-verification-portal-unbuilt`, M5 remainder).
 *
 * Server-rendered, dependency-free (node:http only — no framework, no build
 * step, matching the repo's stack rules). The reviewer sees the schema-gated
 * ReviewBundle (exact output text, the five verifier checks + detector/triage
 * surfacing, receipts, evidence claims, firewall status, PPP-TTT verdict +
 * ABCDE record, history summary) and records approve / reject / amend. The
 * decision goes DURABLE-FIRST through gate-record-store, which then hydrates
 * the frozen releaseToPatient() gate.
 *
 * WHAT THIS SERVER NEVER DOES: it never releases anything to a patient. The
 * only consumer of its decisions is the frozen gate, called by a (future,
 * separately gated) patient path. Approving here does not send; it permits
 * the gate to permit.
 *
 * AUTH (fail-closed): HEYDOC_PORTAL_TOKEN (resolved via the secrets seam) is
 * REQUIRED whenever the mode-normaliser enforces live (staging/production/
 * unknown) — startPortal() refuses to start a live portal without it. In
 * mock/dry_run dev the token is optional; if set, it is enforced. All
 * non-/healthz routes require `Authorization: Bearer <token>` when a token is
 * active. Clinician identity/signature capture is the reviewer's attestation
 * fields on the decision form (real identity federation is deploy-time work,
 * L2/L11).
 *
 * QUEUE SOURCES:
 *  - submitForReview(result) / POST /submit — a live consult flow hands the
 *    full pipeline result in-process (encounter-scoped; nothing extra is
 *    persisted by the portal itself);
 *  - the audit ledger + synthetic content store — dev/staging runs whose
 *    exact output was persisted (synthetic-only guard upstream) are listed
 *    for review by hash.
 */
import { createServer } from "node:http";
import { normaliseMode } from "../verification/mode.js";
import { hashCandidateOutput } from "../verification/hash.js";
import { readLedger, readContent } from "../verification/audit-store.js";
import { metricsSnapshot } from "../verification/metrics.js";
import { hasSecret, getSecret } from "../integration/secrets.js";
import { buildReviewBundle, validateReviewBundle } from "./review-bundle.js";
import { recordDecisionDurable, hydrateGateRegistry, effectiveDecision } from "./gate-record-store.js";

/** In-memory pending queue: run_id → ReviewBundle (encounter-scoped). */
const pending = new Map();

/** Submit a pipeline result (or a prebuilt bundle) for clinician review. */
export function submitForReview(resultOrBundle) {
  const bundle =
    resultOrBundle && resultOrBundle.bundle_version === "1.0"
      ? validateReviewBundle(resultOrBundle)
      : buildReviewBundle(resultOrBundle);
  pending.set(bundle.run_id, bundle);
  return bundle;
}

/** Test/ops helper. */
export function clearPending() {
  pending.clear();
}

// --- rendering helpers ----------------------------------------------------------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem;max-width:70rem}
 table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.4rem .6rem;text-align:left;vertical-align:top}
 pre{background:#f6f6f6;padding:1rem;overflow-x:auto;white-space:pre-wrap}
 .pass{color:#0a7a2f}.fail{color:#b00020;font-weight:600}.warn{color:#8a6d00}
 .tier-STOP{color:#b00020;font-weight:700}.tier-CAUTION{color:#8a6d00;font-weight:700}.tier-GO{color:#0a7a2f;font-weight:700}
 form.decision{border:1px solid #ccc;padding:1rem;margin-top:1rem}
 .banner{background:#fff3cd;border:1px solid #8a6d00;padding:.5rem 1rem;margin-bottom:1rem}
</style></head><body>
<div class="banner"><strong>Clinical decision support — not a licensed medical practitioner.</strong>
 Every output is a provisional suggestion requiring YOUR review; nothing releases to a patient except the exact attested text, via the release gate. No diagnosis. No decisions.</div>
${body}</body></html>`;
}

function renderChecks(v) {
  const rows = (v.results || [])
    .map((r) => `<tr><td>${esc(r.check)}</td><td class="${r.passed ? "pass" : "fail"}">${r.passed ? "pass" : "FAIL"}</td><td>${esc(r.reason || "")}</td></tr>`)
    .join("");
  const missing = (v.missing_receipts || []).map((m) => `<li>${esc(m)}</li>`).join("");
  return `<h3>Verification — <span class="${v.pass ? "pass" : "fail"}">${v.pass ? "PASS" : "FAIL"}</span></h3>
<table><tr><th>check</th><th>result</th><th>reason</th></tr>${rows}</table>
${missing ? `<h4>Surfaced findings (missing receipts / detector / triage)</h4><ul>${missing}</ul>` : ""}`;
}

function renderPppTtt(bundle) {
  const t = bundle.ppp_ttt;
  if (!t) return "";
  const abcde = bundle.abcde_record?.abcde;
  const sn = abcde?.D_pitfalls?.safety_net || [];
  return `<h3>PPP-TTT graded triage: <span class="tier-${esc(t.tier)}">${esc(t.tier)}</span>${t.run_tier && t.run_tier !== t.tier ? ` (run tier ${esc(t.run_tier)})` : ""}</h3>
<p>${esc(t.reason || "")}</p>
${abcde ? `<p><strong>Pathway:</strong> ${esc(abcde.B_balance?.pathway)} · <strong>Residual risk:</strong> ${esc(abcde.B_balance?.residual_risk)} ·
 <strong>Patient decision:</strong> ${esc(abcde.E_education?.patient_decision)} (subordinate to YOUR sign-off)</p>
${sn.length ? `<p><strong>Safety-net:</strong></p><ul>${sn.map((s) => `<li>${esc(s.descriptor)}</li>`).join("")}</ul>` : ""}` : ""}`;
}

function renderBundle(bundle) {
  const decided = effectiveDecision(bundle.candidate_output_hash);
  return `<h1>Review — run ${esc(bundle.run_id)}</h1>
<p><strong>Trunk:</strong> ${esc(bundle.trunk_id || "—")} · <strong>Mode:</strong> ${esc(bundle.mode)} ·
 <strong>Hash:</strong> <code>${esc(bundle.candidate_output_hash)}</code> ·
 <strong>Bundle:</strong> <code>${esc(bundle.bundle_sha256)}</code></p>
${bundle.firewall_status ? `<p><strong>Pharmacology firewall:</strong> <span class="${bundle.firewall_status === "PASS" ? "pass" : "fail"}">${esc(bundle.firewall_status)}</span>${bundle.continuation_blocked ? " — continuation BLOCKED (no override)" : ""}</p>` : ""}
${bundle.hard_stops.length ? `<ul class="fail">${bundle.hard_stops.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
${renderPppTtt(bundle)}
${renderChecks(bundle.verification)}
<h3>Candidate output (exact bytes under review)</h3><pre>${esc(bundle.candidate_output)}</pre>
<h3>Receipts (${bundle.receipts.length})</h3>
<table><tr><th>request_id</th><th>upstream</th><th>mode</th></tr>
${bundle.receipts.map((r) => `<tr><td>${esc(r.request_id)}</td><td>${esc(r.upstream)}</td><td>${esc(r.mode)}</td></tr>`).join("")}</table>
${decided ? `<p><strong>Latest decision on this hash:</strong> ${esc(decided.decision)} by ${esc(decided.clinician_id)} at ${esc(decided.decided_at_utc)} (re-review appends; latest wins)</p>` : ""}
<form class="decision" method="POST" action="/decision">
 <h3>Clinician decision (mandatory human sign-off)</h3>
 <input type="hidden" name="run_id" value="${esc(bundle.run_id)}">
 <input type="hidden" name="candidate_output_hash" value="${esc(bundle.candidate_output_hash)}">
 <input type="hidden" name="bundle_sha256" value="${esc(bundle.bundle_sha256)}">
 <p><label>Clinician ID <input name="clinician_id" required></label></p>
 <p><label><input type="radio" name="decision" value="approved" required> Approve (exact text above)</label><br>
    <label><input type="radio" name="decision" value="rejected"> Reject (nothing releases)</label><br>
    <label><input type="radio" name="decision" value="amended"> Amend (attest the amended text below)</label></p>
 <p><label>Amended text (only for Amend)<br><textarea name="amended_text" rows="6" cols="80"></textarea></label></p>
 <p><label>Signature ref <input name="signature_ref" required placeholder="e.g. sig:AHPRA-…"></label></p>
 <p><label>Notes <input name="notes" size="60"></label></p>
 <button type="submit">Record decision</button>
</form>`;
}

// --- queue assembly ---------------------------------------------------------------
function ledgerQueueItems() {
  const items = [];
  const seen = new Set();
  for (const e of readLedger()) {
    if (seen.has(e.run_id)) continue;
    seen.add(e.run_id);
    if (pending.has(e.run_id)) continue;
    const output = readContent(e.candidate_output_hash);
    if (typeof output !== "string" || !output.length) continue; // live runs never persist content
    items.push({ run_id: e.run_id, trunk_id: e.trunk_id, hash: e.candidate_output_hash, pass: e.pass, mode: e.mode, source: "ledger" });
  }
  return items;
}

function bundleFromLedger(runId) {
  const entries = readLedger().filter((e) => e.run_id === runId);
  if (!entries.length) return null;
  const e = entries[entries.length - 1];
  const output = readContent(e.candidate_output_hash);
  if (typeof output !== "string" || !output.length) return null;
  // Minimal reviewable bundle from the durable trail (synthetic content only).
  return buildReviewBundle({
    run_id: e.run_id,
    trunk_id: e.trunk_id,
    timestamp_utc: e.recorded_at_utc,
    output,
    verification: {
      pass: e.pass,
      results: (e.check_results || []).map((r) => ({ check: r.check, passed: r.passed })),
      missing_receipts: [],
      candidate_output_hash: e.candidate_output_hash,
    },
    packet: { mode: e.mode, receipts: e.receipts || [], evidence: [] },
  });
}

// --- HTTP --------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseBody(raw, contentType) {
  if ((contentType || "").includes("application/json")) return JSON.parse(raw);
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

/**
 * Create the portal HTTP server (not listening — startPortal() listens).
 * @param {{ token?: string }} [opts] - auth token override (tests)
 */
export function createPortalServer(opts = {}) {
  const mode = normaliseMode(process.env.HEYDOC_MODE_DEFAULT);
  const token = opts.token ?? (hasSecret("env:HEYDOC_PORTAL_TOKEN") ? getSecret("env:HEYDOC_PORTAL_TOKEN") : null);
  if (mode.enforce_live && !token) {
    // FAIL-CLOSED: a live-enforced portal without authentication must not start.
    throw new Error("portal refused to start: mode enforces live but HEYDOC_PORTAL_TOKEN is not configured (an unauthenticated clinician portal is not a portal)");
  }
  hydrateGateRegistry(); // durable decisions survive restarts

  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, body, type = "text/html; charset=utf-8") => {
      res.writeHead(code, { "content-type": type });
      res.end(body);
    };
    try {
      if (url.pathname === "/healthz") return send(200, JSON.stringify({ ok: true, mode: mode.context_mode }), "application/json");

      // Auth: whenever a token is active, every other route requires it.
      if (token) {
        const auth = req.headers["authorization"] || "";
        if (auth !== `Bearer ${token}`) return send(401, JSON.stringify({ error: "unauthorized" }), "application/json");
      }

      if (url.pathname === "/metrics") return send(200, JSON.stringify(metricsSnapshot(), null, 2), "application/json");

      if (url.pathname === "/queue" || url.pathname === "/") {
        const rows = [
          ...[...pending.values()].map((b) => ({ run_id: b.run_id, trunk_id: b.trunk_id, hash: b.candidate_output_hash, pass: b.verification.pass, mode: b.mode, source: "live-submit" })),
          ...ledgerQueueItems(),
        ]
          .map((i) => {
            const decided = effectiveDecision(i.hash);
            return `<tr><td><a href="/review?run=${encodeURIComponent(i.run_id)}">${esc(i.run_id)}</a></td>
<td>${esc(i.trunk_id || "—")}</td><td class="${i.pass ? "pass" : "fail"}">${i.pass ? "pass" : "FAIL"}</td>
<td>${esc(i.mode)}</td><td>${esc(i.source)}</td><td>${decided ? esc(decided.decision) : "<strong>awaiting review</strong>"}</td></tr>`;
          })
          .join("");
        return send(200, page("Review queue", `<h1>Clinician review queue</h1><table><tr><th>run</th><th>trunk</th><th>verify</th><th>mode</th><th>source</th><th>decision</th></tr>${rows || ""}</table>`));
      }

      if (url.pathname === "/review") {
        const runId = url.searchParams.get("run") || "";
        const bundle = pending.get(runId) || bundleFromLedger(runId);
        if (!bundle) return send(404, page("Not found", `<h1>No reviewable bundle for run ${esc(runId)}</h1>`));
        return send(200, page(`Review ${runId}`, renderBundle(bundle)));
      }

      if (url.pathname === "/submit" && req.method === "POST") {
        const body = parseBody(await readBody(req), req.headers["content-type"]);
        const bundle = submitForReview(body);
        return send(201, JSON.stringify({ queued: bundle.run_id, bundle_sha256: bundle.bundle_sha256 }), "application/json");
      }

      if (url.pathname === "/decision" && req.method === "POST") {
        const body = parseBody(await readBody(req), req.headers["content-type"]);
        const record = {
          run_id: body.run_id,
          candidate_output_hash: body.candidate_output_hash,
          clinician_id: body.clinician_id,
          decision: body.decision,
          decided_at_utc: new Date().toISOString(),
          signature_ref: body.signature_ref,
          ...(body.notes ? { notes: body.notes } : {}),
          ...(body.decision === "amended"
            ? { amended_output_hash: hashCandidateOutput(String(body.amended_text || "")) }
            : {}),
        };
        const { entry } = recordDecisionDurable(record, { bundle_sha256: body.bundle_sha256 || undefined });
        pending.delete(body.run_id);
        return send(
          201,
          page("Decision recorded", `<h1>Decision recorded</h1>
<p><strong>${esc(record.decision)}</strong> by ${esc(record.clinician_id)} on <code>${esc(record.candidate_output_hash)}</code></p>
<p>Durable entry <code>${esc(entry.entry_id)}</code> (seq ${entry.seq}). This does NOT send anything to a patient —
 it permits the release gate to permit the exact attested text, on a patient path that does not exist yet.</p>
<p><a href="/queue">Back to queue</a></p>`)
        );
      }

      return send(404, JSON.stringify({ error: "not found" }), "application/json");
    } catch (err) {
      // Fail loud but never leak internals beyond the message.
      return send(400, JSON.stringify({ error: String(err && err.message ? err.message : err) }), "application/json");
    }
  });
}

/** CLI entrypoint: node portal/server.js (port via HEYDOC_PORTAL_PORT). */
export function startPortal() {
  const port = Number(process.env.HEYDOC_PORTAL_PORT || 8787);
  const server = createPortalServer();
  server.listen(port, () => {
    process.stderr.write(JSON.stringify({ event: "portal_started", port, mode: normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode }) + "\n");
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startPortal();
