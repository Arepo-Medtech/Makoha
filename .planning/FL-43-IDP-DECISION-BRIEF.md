# FL-43 — Clinician-identity provider (IdP): operator decision brief

> **Status:** OPEN operator decision `[DECIDE + CRED]`. Sole remaining input to the
> **Clinician Verification Portal** release blocker (every other half is built).
> Long-lead — initiate the vendor/protocol decision now; it completes late because
> it starts late. Idle since 2026-07-13.
>
> **Audience:** whoever runs your identity infrastructure (+ the operator/clinical
> sign-off). This is engineering guidance, not legal/regulatory advice — the
> *rigour* of AHPRA verification is an org/compliance call (surfaced, not decided).

---

## 1. TL;DR + recommendation

**What's being decided:** which identity provider the Verification Portal uses to
prove *which* clinician signed off each AI output before it can reach a patient.

**Recommendation:** **OIDC via a managed IdP** (Auth0 / Okta / Microsoft Entra ID /
Google Workspace), carrying each clinician's **AHPRA registration number as a
verified custom claim** that is checked against the public AHPRA register at
onboarding. Rationale in §5. SAML only if your org has already standardised on it.
There is no "log in with AHPRA" IdP — see §4.

**Why it matters:** until a real IdP is registered, the portal **refuses every
decision on a live path by design** — the built-in `dev` provider is fail-closed
out of any live-enforced context, so a shared token can no longer establish *who*
attested. Clearing FL-43 takes one of the four patient-facing release blockers to
green.

---

## 2. What is already built (FL-42, merged) — you are NOT paying for plumbing

[`portal/identity-federation.js`](../portal/identity-federation.js) is done + contract-tested:

- **`resolveClinicianIdentity(req, mode)`** — returns a verified identity only from
  a registered, non-`dev` provider; fail-closed on every ambiguity.
- **`bindSignature(identity, candidate_output_hash)`** — ties the signature to *who*
  signed and *what exact bytes*: `sig:federated:<idp>:<ahpra>:<proof>`. A signature
  cannot be transplanted to another clinician or another output.
- **`registerIdentityProvider(name, adapter)`** — the slot your chosen provider
  plugs into.
- **`identityBlock()`** — the verified-identity record persisted on the durable,
  hash-chained gate record (and, via FL-11, into WORM storage). It **never** enters
  the LLM context packet — medicolegal trail only.
- A built-in **`dev`** provider that is reserved and **refused on any live path**.

So the socket is wired and the safety default is correct. FL-43 is: choose the
provider, provision it, hand back the creds/config; then a small ENG adapter.

---

## 3. The options

| Option | What it is | Choose it when | Watch-outs |
|---|---|---|---|
| **OIDC** *(recommended)* | Clinicians sign in through a managed IdP (Auth0/Okta/Entra ID/Google Workspace); the portal validates an OIDC ID token / access token. | Default. Modern, low-friction, broad tooling, easy to add MFA + carry an AHPRA claim. | You must provision an app registration and decide where the AHPRA number lives (a verified custom claim). |
| **SAML** | Enterprise SSO via SAML assertions from an IdP. | Your org already runs SAML SSO and mandates it. | Heavier integration (metadata exchange, assertion parsing); more moving parts than OIDC for the same result. |
| **AHPRA-anchored** | Verify the clinician is a currently-registered AU practitioner. | You want the strongest clinical proof of registration. | **Not a login provider** — AHPRA offers no consumer OIDC/SAML. In practice this is *OIDC (or SAML) for auth* **+** an AHPRA number captured and verified against the public register (§4), not a standalone IdP. |

All three plug into the **same** `registerIdentityProvider()` contract (§6) — the
choice changes the adapter's internals, not the portal.

---

## 4. The AHPRA question (read this — it's the clinically load-bearing part)

The signature the portal records **bakes the AHPRA registration number into the
signature reference** (`sig:federated:<idp>:<ahpra>:<proof>`) and stores it on the
gate record. So an AHPRA number is a first-class attribute the system expects.

But **you cannot "authenticate with AHPRA"** — there is no AHPRA identity provider.
The practical, defensible pattern is two layers:

1. **Authentication** — the clinician proves *they are this account* via OIDC/SAML
   (with MFA).
2. **Registration attestation** — that account carries an **AHPRA registration
   number as a verified claim**, established by checking it against the **public
   AHPRA register** and attaching it to the IdP user.

**The org decision (surface, not decide):** *how rigorously and how often* AHPRA is
verified — a one-time onboarding check, a periodic re-check (registration lapses,
conditions, suspensions), or an automated lookup. That is a compliance/risk call for
qualified specialists, not an engineering one. The engineering simply carries and
binds whatever verified AHPRA value your process attaches.

---

## 5. Why OIDC + AHPRA-claim is the recommendation

- **Lowest friction to green** — a managed OIDC IdP is a same-week setup; SAML and a
  bespoke register integration are longer.
- **MFA + lifecycle for free** — managed IdPs give you MFA, deprovisioning, and audit
  out of the box, which matter for a clinical sign-off authority.
- **Matches the seam** — the adapter just validates the token and returns
  `{ subject, ahpra_registration, display_name }`; the AHPRA claim slots straight in.
- **Doesn't over-commit** — you can start with OIDC + onboarding-verified AHPRA and
  later tighten the AHPRA re-verification cadence without touching the portal.

---

## 6. The technical contract ENG will implement (so your IdP team knows the shape)

Your chosen provider becomes a small **adapter** registered at deploy:

```
registerIdentityProvider("<name>", {
  // MUST validate the caller's credential ITSELF (verify the OIDC/SAML token
  // signature, issuer, audience, expiry) — the portal does NOT trust an
  // unvalidated token. Return the verified identity, or null to fail closed.
  resolve(req) {
    // req = the incoming HTTP request; the IdP credential rides its headers.
    // → return { subject, ahpra_registration, display_name }  (verified)
    // → return null                                            (cannot verify)
  }
})
```

- `subject` — stable unique id for the clinician (the IdP `sub`).
- `ahpra_registration` — the verified AHPRA number (the §4 claim).
- `display_name` — human-readable name for the gate record.
- Selected at runtime by **`HEYDOC_PORTAL_IDP=<name>`**.
- All secrets (client id/secret, issuer, signing keys / SAML metadata) are injected
  via the **secrets manager** (`aws-sm`), exactly like the Anthropic key and the WORM
  bucket — **never** committed, never handled by the agent.

---

## 7. Hand-back checklist (what you provide)

- [ ] **Decision:** OIDC | SAML | (OIDC/SAML + AHPRA-claim). Name the IdP vendor.
- [ ] **AHPRA policy:** how the registration number is verified + re-verified (§4) — your compliance call.
- [ ] **Provisioned app** at the IdP (app registration / SAML relying-party); note the issuer/discovery URL, audience/client-id, and how the AHPRA claim is exposed.
- [ ] **Credentials in the secrets manager** (client secret / signing certs / SAML metadata) — hand back the *secret names/ARNs*, not the values.
- [ ] **Env values:** the provider `name` you want (`HEYDOC_PORTAL_IDP=<name>`) + any non-secret config (issuer, audience, claim path).

## 8. What ENG does after hand-back

1. Write the `<name>` adapter (`resolve(req)`: validate the token → verified identity).
2. `registerIdentityProvider("<name>", adapter)` in the deploy bootstrap; set `HEYDOC_PORTAL_IDP`.
3. Staging verification: a **verified (non-`dev`)** clinician identity resolves, and `bindSignature()` records a signature on a **staging gate record** (dev provider proven refused on the live path). Contract test extended.

## 9. Done-when (from FINISH-LINE FL-43)

> A live IdP registered + `HEYDOC_PORTAL_IDP` set; a verified (non-dev) clinician
> identity resolves and binds a signature on a staging gate record;
> `clinician-verification-portal-unbuilt` advances toward resolved (with FL-11).

## 10. Non-negotiables (do not weaken)

- The verified identity **never** flows into the LLM context packet — gate-record/WORM trail only.
- The `dev` provider is **never** accepted on a live-enforced path.
- The signature is bound to the **exact `candidate_output_hash`** + the verified clinician — it cannot be transplanted.
- Credentials live in the secrets manager; the agent never sees or enters them.
