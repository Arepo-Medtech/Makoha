library PaediatricReview version '0.2.0'

/*
 * A2 CQL rule-layer PILOT (Mechanical Inventory, plan .planning/PLAN-A1-A2.md).
 *
 * CLINICAL DECISION — clinician/operator (Ken), 2026-07-24. The minor in-person-review
 * threshold is AGE < 16, NOT < 18.
 *
 * Clinical basis (CORRECTS v0.1.0): 16–18-year-olds are dosed as ADULTS for the low-acuity
 * medicines this service covers — there is no separate paediatric dose to withhold — so
 * routing every under-18 to in-person review is a BARRIER TO CARE, not a safeguard. In a
 * low-acuity everyday-care tool the harm of over-restriction is real (e.g. blocking a
 * 16-year-old from the oral contraceptive pill → an avoidable unwanted pregnancy). Refusal
 * is not a free "safe" default; unmet care is a harm to weigh.
 *
 * Bands:
 *   < 16            → in-person review (consent-capacity grounds; Gillick/mature-minor).
 *   16 to < 18      → care PROCEEDS. A NON-BLOCKING caveat is surfaced: the young person
 *                     should have a PLAUSIBLE grasp of the understanding underlying Gillick
 *                     competence — plausible, NOT an exact/definitive determination. That
 *                     judgment stays with the human clinician/pharmacist; the rule does not
 *                     (and cannot) assess competence.
 *   age unknown     → in-person review (fail-safe: confirm age before proceeding).
 *
 * Deterministic by construction: age is a parameter from the packet's patient_age_years
 * fact; the rule computes AGE BANDS only. The competence judgment is surfaced as a caveat,
 * never computed here. The verdict composes into verification additively/monotone — it can
 * add a review flag or a caveat, never rescue or downgrade, and never emits a dose.
 */

parameter PatientAgeYears Integer

context Unfiltered

// Consent-capacity in-person review: under 16, or age unknown (fail-safe — confirm age).
define "InPersonReviewFlag":
  PatientAgeYears is null or PatientAgeYears < 16

// 16–18 band: care proceeds; surface a NON-BLOCKING plausible-Gillick-competence caveat.
define "GillickCompetenceCaveat":
  PatientAgeYears is not null and PatientAgeYears >= 16 and PatientAgeYears < 18
