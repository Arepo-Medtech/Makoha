/**
 * patient/consult-server — the patient-facing consult surface (LIVE_PLAN L11).
 *
 * Dependency-free (node:http, server-rendered — no framework, no build step,
 * matching the repo's stack rules). A DEMONSTRATION/dev surface: it runs a
 * consult through the sequenced pipeline (mock Step-4) + PPP-TTT triage and
 * renders the screen chosen by patient/consult-flow.js. Because
 * decidePatientScreen() gates every clinical draft through the FROZEN
 * releaseToPatient(), and mock/dev release NOTHING, this surface opens NO
 * patient path — it shows safety-routing and "pending clinician sign-off"
 * exactly as it would in production before a clinician signs off.
 *
 * WHAT THIS SERVER NEVER DOES: set the patient-eligibility flag, bypass the
 * release gate, emit a dose/diagnosis, or make an emergency screen overridable.
 *
 * A banner states the posture on every page. Emergencies render a
 * non-overridable 000 screen. All rendered text is HTML-escaped.
 */
import { createServer } from "node:http";
import { normaliseMode } from "../verification/mode.js";
import { runPipeline } from "../verification/pipeline.js";
import { decidePatientScreen, SCREENS } from "./consult-flow.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, body, mode) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem auto;max-width:44rem;line-height:1.5}
 .banner{background:#eef;border:1px solid #557;padding:.6rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:.95rem}
 .emergency{background:#fdecea;border:2px solid #b00020;padding:1rem;border-radius:8px}
 .emergency h1{color:#b00020;margin-top:0}
 .caveat{background:#fff8e6;border:1px solid #8a6d00;padding:.8rem 1rem;border-radius:6px;margin:1rem 0}
 .safety-net li{margin:.3rem 0}
 button,.choice{font-size:1rem;padding:.5rem 1rem;margin-right:.5rem}
 .pending{color:#555;font-style:italic}
 form.intake label{display:block;margin:.6rem 0}
 textarea{width:100%}
</style></head><body>
<div class="banner"><strong>Clinical decision support — not a doctor.</strong> Environment: <code>${esc(mode)}</code>.
 In this environment nothing is released to patients: every clinical suggestion waits for a clinician's review and sign-off. No diagnosis. No decisions.</div>
${body}</body></html>`;
}

function intakePage(mode) {
  return page("Start a consult", `<h1>Tell us what's going on</h1>
<form class="intake" method="POST" action="/consult">
 <label>What's the main problem today?<br><textarea name="symptoms" rows="4" required></textarea></label>
 <label>Your age <input name="age" type="number" min="0" max="120"></label>
 <label><input type="checkbox" name="interpreter_required" value="1"> I need an interpreter</label>
 <button type="submit">Continue</button>
</form>`, mode);
}

function renderScreen(s, mode) {
  if (s.screen === SCREENS.EMERGENCY) {
    return page("Emergency — call 000", `<div class="emergency"><h1>Call 000 now</h1><p>${esc(s.message)}</p>
<p><strong>This screen cannot be dismissed to continue the consult.</strong> Your safety comes first.</p></div>`, mode);
  }
  if (s.screen === SCREENS.PAEDIATRIC) {
    return page("See a clinician in person", `<h1>Please see a clinician in person</h1><p>${esc(s.message)}</p>`, mode);
  }
  if (s.screen === SCREENS.INTERPRETER) {
    return page("Connecting you with a clinician", `<h1>We'll connect you with a clinician</h1><p>${esc(s.message)}</p>`, mode);
  }
  if (s.screen === SCREENS.CAUTION) {
    const net = (s.safety_net || []).map((d) => `<li>${esc(d.descriptor)} <em>(${esc(d.when_urgent)})</em></li>`).join("");
    return page("A few things to check", `<h1>Some things worth checking with a clinician</h1>
<div class="caveat"><strong>${esc(s.caveats && s.caveats.plain_language)}</strong><br>No diagnosis. No decisions.</div>
${net ? `<h3>Watch for these — seek urgent care if any happen:</h3><ul class="safety-net">${net}</ul>` : ""}
<p>You can choose to continue this consult toward a clinician's review, or stop and see a doctor now. Either choice is fine, and a clinician reviews everything before it applies to you.</p>
<form method="POST" action="/decision"><button class="choice" name="choice" value="proceed">Continue toward clinician review</button>
<button class="choice" name="choice" value="decline">Stop and see a doctor</button></form>
${s.released ? "" : `<p class="pending">Your prepared consult is awaiting clinician sign-off before it's shared (${esc(s.pending_reason)}).</p>`}`, mode);
  }
  if (s.screen === SCREENS.DRAFT_RELEASED) {
    return page("Your consult", `<h1>Your consult (clinician-signed)</h1><p>${esc(s.draft)}</p>`, mode);
  }
  // DRAFT_PENDING
  return page("Awaiting clinician sign-off", `<h1>Almost done</h1><p>${esc(s.message)}</p>
<p class="pending">${esc(s.pending_reason)}</p>`, mode);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 1_000_000) reject(new Error("body too large")); });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

/** Create the patient consult HTTP server (not listening). */
export function createConsultServer() {
  const mode = normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode;
  return createServer(async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8") => { res.writeHead(code, { "content-type": type }); res.end(body); };
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz") return send(200, JSON.stringify({ ok: true, mode }), "application/json");
      if (url.pathname === "/" && req.method === "GET") return send(200, intakePage(mode));

      if (url.pathname === "/consult" && req.method === "POST") {
        const body = Object.fromEntries(new URLSearchParams(await readBody(req)));
        // The intake never becomes a fabricated flag: for this demo surface we
        // run the pipeline with no raised_flags (a real intake→flag mapping is
        // Trunk 1.0's job, plan-gated). The gate + screens are what we exercise.
        const result = await runPipeline({ user_input: String(body.symptoms || "").slice(0, 2000) });
        const patient_context = {
          ...(body.age ? { age: Number(body.age) } : {}),
          ...(body.interpreter_required ? { interpreter_required: true } : {}),
        };
        const screen = decidePatientScreen({ result, patient_context });
        return send(200, renderScreen(screen, mode));
      }

      if (url.pathname === "/decision" && req.method === "POST") {
        const body = Object.fromEntries(new URLSearchParams(await readBody(req)));
        const proceed = body.choice === "proceed";
        return send(200, page(proceed ? "Thanks — a clinician will review" : "See a doctor", `<h1>${proceed ? "A clinician will review your consult" : "Please see a doctor"}</h1>
<p>${proceed ? "Everything you shared is being prepared for a clinician to review and sign off. Nothing applies to you until they do." : "You've chosen to stop and see a doctor — that's a safe choice. Please book with your GP or call your local clinic."}</p>`, mode));
      }

      return send(404, page("Not found", "<h1>Not found</h1>", mode));
    } catch (err) {
      // Fail-safe: any server error routes to the emergency screen, never a draft.
      return send(200, renderScreen({ screen: SCREENS.EMERGENCY, message: "Something went wrong. If this is urgent, call 000. Otherwise please see a clinician." }, mode));
    }
  });
}

export function startConsult() {
  const port = Number(process.env.HEYDOC_CONSULT_PORT || 8788);
  const server = createConsultServer();
  server.listen(port, () => process.stderr.write(JSON.stringify({ event: "patient_consult_started", port, mode: normaliseMode(process.env.HEYDOC_MODE_DEFAULT).context_mode }) + "\n"));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startConsult();
