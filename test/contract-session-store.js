/**
 * Contract tests for session-bound persistence enforcement
 * (verification/session-store.js) — ARCH_PLAN C8 / FMEA F12; the technical
 * enforcement behind "no persistence beyond session" (<data_handling>) and
 * Trust Boundary 4 (no demographics outside the identity boundary).
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - NO PERSISTENCE PAST ENCOUNTER: state round-trips only while open;
 *     closeEncounter destroys everything; reads/writes after close throw;
 *     a closed ref can never be reopened (no zombie sessions);
 *   - NO IMPLICIT STATE: writing to a never-opened encounter throws;
 *   - NO DEMOGRAPHICS: demographic-looking keys (top-level and nested) and
 *     IHI-shaped values are refused with a thrown error; legitimate clinical
 *     working state (receipt ids, sanitised facts, encounter refs) passes;
 *   - encounter isolation: one encounter's state is invisible to another;
 *   - the module exposes NO persistence surface (no save/write/export API);
 *   - no file is written under the data dir during use (memory only).
 * Run from repo root: node test/contract-session-store.js
 */
import { mkdtempSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as store from "../verification/session-store.js";

const {
  openEncounter, closeEncounter, putWorkingState, getWorkingState,
  listWorkingState, isOpen, newEncounterRef, destroyAllEncounters,
} = store;

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// Point the (unrelated) data dir at a throwaway and prove it stays empty.
const dataDir = mkdtempSync(join(tmpdir(), "heydoc-session-"));
process.env.HEYDOC_DATA_DIR = dataDir;

// 1. Round-trip within an open encounter.
const enc = openEncounter();
check("ref shape is encounter-scoped", /^enc-/.test(enc));
putWorkingState(enc, "triage_signal", { safety_gate: "clear", routing: ["2.0", "3.0"] });
putWorkingState(enc, "receipt_refs", ["term-mock-1", "pharmchk-abc12345"]);
check("round-trip while open", getWorkingState(enc, "triage_signal").safety_gate === "clear");
check("listWorkingState sees keys", listWorkingState(enc).length === 2);
check("isOpen true while open", isOpen(enc) === true);

// 2. Encounter isolation.
const enc2 = openEncounter();
check("other encounter sees nothing", getWorkingState(enc2, "triage_signal") === undefined);
closeEncounter(enc2);

// 3. Close destroys everything; nothing survives; no resurrection.
const rec = closeEncounter(enc);
check("close reports destroyed keys", rec.keys_destroyed === 2 && rec.session_ref === enc);
check("isOpen false after close", isOpen(enc) === false);
check("read after close throws", throws(() => getWorkingState(enc, "triage_signal"), /closed|destroyed/));
check("write after close throws", throws(() => putWorkingState(enc, "k", 1), /closed|destroyed/));
check("double close throws", throws(() => closeEncounter(enc), /closed|destroyed/));
check("closed ref cannot reopen", throws(() => openEncounter(enc), /never be reopened/));

// 4. No implicit state creation.
check("write to never-opened encounter throws", throws(() => putWorkingState("enc-never-opened", "k", 1), /never opened/));
check("read from never-opened encounter throws", throws(() => getWorkingState("enc-never-opened", "k"), /never opened/));

// 5. Demographic guard — Trust Boundary 4, mechanical.
const enc3 = openEncounter(newEncounterRef());
const refused = (value) => throws(() => putWorkingState(enc3, "wk", value), /REFUSED/);
check("refuses patient_name key", refused({ patient_name: "Jane Citizen" }));
check("refuses date_of_birth key", refused({ date_of_birth: "1966-04-01" }));
check("refuses nested email key", refused({ contact: { email: "jane@example.invalid" } }));
check("refuses demographics blob", refused({ demographics: { age: "58" } }));
check("refuses medicare key", refused({ medicare_number: "0000000000" }));
check("refuses address deep in an array", refused([{ ok: true }, { home_address: "1 Test St" }]));
check("refuses IHI-shaped value in a string", refused({ note: "patient IHI 8003601234567890 recorded" }));
// Legitimate clinical working state passes.
check("allows receipt refs + sanitised facts", !throws(() => putWorkingState(enc3, "facts", {
  fact_id: "f-1", category: "lab_result", label: "Creatinine", value: "H — above reference interval",
  sanitised_by: "investigation-parser", receipt_id: "fhir-mock-1", snomed_display: "Creatinine measurement",
}), /./));
check("allows encounter refs", !throws(() => putWorkingState(enc3, "linked_encounter", newEncounterRef()), /./));
closeEncounter(enc3);

// 6. No persistence surface: the module exports no save/write/serialise API,
// and nothing touched the filesystem (the throwaway data dir stays empty).
const surface = Object.keys(store).join(",");
check("no persistence-shaped export", !/save|persist|write|serialise|serialize|export|flush|dump/i.test(surface));
check("filesystem untouched (memory only)", readdirSync(dataDir).length === 0);

// 7. destroyAllEncounters sweeps everything open.
const a = openEncounter(), b = openEncounter();
putWorkingState(a, "k1", 1); putWorkingState(b, "k2", 2); putWorkingState(b, "k3", 3);
check("destroyAllEncounters destroys all state", destroyAllEncounters() === 3);
check("all encounters closed after sweep", !isOpen(a) && !isOpen(b));

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-session-store: OK");
