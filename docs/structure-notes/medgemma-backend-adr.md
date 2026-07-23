# ADR — MedGemma alternative generation backend (Mechanical Inventory Phase E)

**Status:** ACCEPTED direction (operator, 2026-07-24). **Docs-only** reconciliation — the MedGemma
engineering was already built and clinician-attested (MEDGEMMA-ADAPTER-PLAN, PR #37, 2026-07-11).
This ADR records the *regulatory* finding the Mechanical-Inventory verification surfaced, which the
build-time registers did not yet capture, and pins the corrected factual baseline.
**Deciders:** operator/clinician (Ken). The TGA SaMD **manufacturer-status** and intended-use
implications (§4) are flagged for **legal/regulatory counsel** — this ADR surfaces them, it does not
decide device classification.
**Not legal, clinical, or regulatory advice.**

---

## 1. Context — the engineering is done; this closes an inventory gap, not a build gap

MedGemma is a **second Step-4 generation backend** behind the *exact same bars* as the Claude
adapter. All of it is built, contract-tested, and green on `main`:

- `integration/llm-adapter-medgemma.js` — a **first-party clean-room HTTPS adapter** (no Google code,
  no model weights in-repo; weights are gitignored/deploy-injected, same posture as the SNOMED CT-AU
  RF2). Packet-only bar (strict `validateContextPacket` re-gate — a smuggled field refuses before any
  fetch), fail-closed to `BLOCKED_NO_PROOF` on every failure (invalid packet, missing endpoint/key,
  HTTP non-2xx, timeout, safety `finish_reason`, empty, truncation), **mock by default**, output →
  the frozen verifier + detectors + PPP-TTT.
- `integration/generation-backend.js` — **Decision A3, selectable-only, NO failover**: a safety
  refusal stays `BLOCKED_NO_PROOF` and is never rerouted to the other model.
- `models/imaging/multimodal.js` — the multimodal pixel path is present but shipped **DARK**
  (`IMAGING_PIXEL_INTERPRETATION=OFF`, fail-safe to `unknown`); a pixel-derived claim carries no
  receipt and cannot reach a patient by any path. **Imaging/DICOM is OUT of scope** for the packet.
- Manifest `#medgemma` REFERENCE row; register item `medgemma-generation-backend` (PARTIAL);
  gap-register **R-41**. **Decision B (licence — HAI-DEF terms cleared for use here) was resolved by
  clinician attestation** (KL, 2026-07-11).

**So Phase E is registration, not code.** The one thing the build-time work did not record is the
regulatory point below, which the Mechanical-Inventory verification of the L6/MedGemma line produced.

## 2. Corrected factual baseline (pin, so the wrong numbers never creep in)

The external source list carried model claims that verification corrected. These errors are **not**
present in any repo doc — this pins the correct facts defensively:

| Claim (as seen) | Corrected fact | Source |
|---|---|---|
| MedGemma 1.5 4B MedQA **64.4%** | **69.1%** — 64.4% was MedGemma **1** 4B | Google model card |
| MedGemma **1.5 27B** / **87.7%** | **Does not exist.** 1.5 shipped **4B only**; 87.7% = MedGemma **1** 27B **text-only zero-shot** | HF `27b-text-it` card |

The adapter's pinned default served id `medgemma-1.5-4b-it` is consistent with "1.5 shipped 4B only"
and stays as-is. The served endpoint (Vertex AI / HAI-DEF hosted / self-host vLLM / HF inference) is
the operator's deploy choice.

## 3. Decision

1. **MedGemma is retained as A3 (selectable-only, no failover).** Unchanged — recorded here for the
   inventory. Claude is the default backend; MedGemma is an optional, off-critical-path alternate
   (a clinical-domain text model + a data-residency / self-host option).
2. **The TGA manufacturer-status finding (§4) is registered** by sharpening gap-register **R-41** and
   cross-linking the existing org classification flag **R-34** — not by minting a third overlapping
   regulatory item. R-34 remains the single org-owned classification decision.
3. **No code, no live connection, no imaging path** is opened by this ADR. The adapter stays
   mock/input-gated until the operator supplies an endpoint + key via the secrets manager and runs
   staging live smoke against the synthetic case set.

## 4. The regulatory finding (counsel-owned — surfaced, not decided)

- **Adapting MedGemma makes *us* the TGA manufacturer.** Under the TGA's Feb-2026 AI/SaMD guidance,
  taking a base model and adapting it for a clinical purpose places the **full conformity burden** on
  the adapter — it is not a shrink-wrapped third-party component we merely consume. Adding a *second
  clinical generative model* is therefore an **intended-use / clinical-risk-profile input** that
  plausibly bears on the device's classification. Per `<regulatory_posture>`, this is **flagged, not
  decided** — it feeds R-34 (TGA SaMD classification undecided), which the operator + qualified
  specialists own.
- **Strategic corollary (genuine technical asset, not a liability to hide):** MedGemma is validated
  **only against the non-public synthetic case store**. Contamination-clean evaluation — a model that
  has demonstrably not seen the eval set — is a real governance asset. The thing to sell is the
  **governance and traceability spine**, not the model intelligence.
- **Distinction from Decision B:** Decision B (licence — *may we use it*) is **resolved** (clinician
  attestation, HAI-DEF terms cleared). This finding is the *separate* question of **what using it does
  to the device's regulatory status** — unresolved, org/counsel-owned, tracked under R-34.

## 5. What Phase E shipped (E.1, docs-only)

- This ADR.
- Sharpened `medgemma-generation-backend` register item + gap-register **R-41** (manufacturer-status
  finding named in `invariant_exposure`; R-34 cross-ref; this ADR linked).
- One-line manufacturer-status cross-ref added to the manifest `#medgemma` notes.
- Register / gap-register / CHANGELOG / completeness-index sync.

**No code.** The adapter, the backend selector, the dark imaging module, the frozen verifier +
detectors + PPP-TTT, and every contract test are **byte-unchanged**. `npm test` +
`npm run verification` stay green.

## 6. Deferred (operator/infra + counsel — not engineering)

- **Engineering tail (input-gated, unchanged):** staging live smoke against a real MedGemma endpoint
  (operator supplies `HEYDOC_MEDGEMMA_ENDPOINT` + key via the secrets manager; synthetic packets only)
  + confirm the served request/response shape (OpenAI-compatible default; a Vertex-native shape is a
  deploy adapter concern). Then validate through `eval:cases`. This is the FL-33 / R-41 remainder.
- **Counsel tail:** the manufacturer-status / intended-use decision under R-34, before any patient path.
- Until both are green, MedGemma stays mock and nothing it produces is patient-facing.
