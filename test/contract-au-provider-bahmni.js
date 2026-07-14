/**
 * Contract test for Track B / Phase B2 — registering Bahmni (OpenMRS FHIR2 R4) as an AU
 * FHIR-R4 network peer in the provider directory. Registration is METADATA ONLY and
 * FAIL-CLOSED: the entry is 'input_gated', carries only example.invalid placeholders + a
 * secrets-manager REFERENCE (never a credential), and buildAuthorizeRequest refuses it until
 * an operator flips it to 'available' with real endpoints + conformance evidence (B3).
 * The FHIR-R4 transport itself is the EXISTING, EHR-agnostic wso2/fhir-broker path — this
 * phase adds no transport code. Run from repo root: node test/contract-au-provider-bahmni.js
 */
import { buildAuthorizeRequest, AU_PROVIDERS } from "../integration/record-sources/sources-client.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const bahmni = AU_PROVIDERS.providers.find((p) => p.id === "au-bahmni");

// 1. Registered, AU, and fail-closed (input_gated — registration never opens a connection).
expect(!!bahmni, "au-bahmni provider is registered in the directory");
expect(bahmni && bahmni.jurisdiction === "AU", "au-bahmni jurisdiction is AU");
expect(bahmni && bahmni.status === "input_gated", "au-bahmni is input_gated (fail-closed until operator supplies creds + conformance)");

// 2. No real endpoints, no secrets — only placeholders + a secrets-manager reference.
expect(bahmni && bahmni.fhir_base_url.includes("example.invalid"), "fhir_base_url is an example.invalid placeholder");
expect(bahmni && bahmni.authorize_endpoint.includes("example.invalid") && bahmni.token_endpoint.includes("example.invalid"), "auth endpoints are example.invalid placeholders");
expect(bahmni && bahmni.client_id_ref.startsWith("secrets://"), "client_id_ref is a secrets-manager reference, never a secret");
expect(bahmni && !/(client_secret|access_token|-----BEGIN)/i.test(JSON.stringify(bahmni)), "no literal secret/token material in the Bahmni entry");

// 3. FHIR R4 posture + the OpenMRS FHIR2 base-URL path shape.
expect(bahmni && /openmrs\/ws\/fhir2\/R4/.test(bahmni.fhir_base_url), "base URL uses the OpenMRS FHIR2 R4 path");
expect(bahmni && /R4/.test(bahmni.conformance) && /localisation/i.test(bahmni.conformance), "conformance notes native R4 + downstream AU Core localisation");

// 4. Scopes cover the AU Core read profiles the fhir-broker validator knows.
for (const s of ["patient/Observation.read", "patient/Condition.read", "patient/MedicationRequest.read", "patient/AllergyIntolerance.read"]) {
  expect(bahmni && bahmni.default_scope.includes(s), `default_scope includes ${s}`);
}

// 5. Fail-closed: an input_gated provider cannot yield a live SMART authorize request.
expect(throws(() => buildAuthorizeRequest("au-bahmni", { redirect_uri: "https://app/cb", state: "s" }), /input_gated|input-gated/),
  "buildAuthorizeRequest REFUSES the input-gated Bahmni provider (no live connection from registration)");

// 6. Directory-level invariants unchanged (still R4 / AU Core 0.3.0 / SMART 2.0.0).
expect(AU_PROVIDERS.fhir_version && AU_PROVIDERS.fhir_version.startsWith("R4"), "directory still declares FHIR R4");
expect(AU_PROVIDERS.standard === "SMART App Launch 2.0.0", "directory still declares SMART App Launch 2.0.0");

if (errors.length) {
  console.error("contract-au-provider-bahmni FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log("B2 au-provider-bahmni PASS (registered · input_gated · placeholders-only · fail-closed authorize)");
process.exit(0);
