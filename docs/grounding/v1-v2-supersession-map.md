# v1 → v2 Supersession Map

Generated read-only from `data/cases/` on 2026-07-17. Pairs each v1 (`case-transform-protocol:v1.2.0`) case
to its v2 (`v2.0.0`) telehealth-reprojected successor built from the SAME source SOAP note (the six folders
AUC/AMS/CVD/CIA/CFE/DST). Retiring the left column removes zero clinical coverage — each scenario survives in v2.

- **Retire (v1, superseded):** 301
- **Keep (v1 orphans, no v2 successor):** 2
- **v2 successors:** 301 (all distinct — no collisions)

## Kept v1 orphans (NOT retired — only coverage for these scenarios)

- `SPEC-CARD-04-00001` (src SPEC-CARD-04-00001) — Non-ST-elevation myocardial infarction (NSTEMI)
- `SPEC-CARD-06-00000` (src -) — Acute decompensated heart failure

## Supersession pairs (retire v1 → keep v2)

| # | v1 (retire) | src | v2 successor (keep) | v2 diagnosis |
|---|---|---|---|---|
| 1 | `SPEC-CARD-01-00002` | CDV-002 | `SPEC-CARD-01-00255` | Angiotensin-converting enzyme (ACE) inhibitor-induced cough (perindopr |
| 2 | `SPEC-CARD-01-00005` | AUC-005 | `SPEC-CARD-01-00205` | Acute Coronary Syndrome |
| 3 | `SPEC-CARD-01-00006` | CDV-006 | `SPEC-CARD-01-00256` | Benign palpitations due to isolated atrial/ventricular ectopic beats,  |
| 4 | `SPEC-CARD-01-00011` | CDV-011 | `SPEC-CARD-01-00211` | Acute decompensated heart failure secondary to underlying cardiomyopat |
| 5 | `SPEC-CARD-01-00012` | AUC-012 | `SPEC-CARD-01-00212` | Acute cardiogenic pulmonary oedema (hypertensive acute left-ventricula |
| 6 | `SPEC-CARD-01-00013` | CDV-013 | `SPEC-CARD-01-00252` | Decompensated cor pulmonale (right-sided heart failure) secondary to e |
| 7 | `SPEC-CARD-01-00017` | CDV-017 | `SPEC-CARD-01-00217` | Acute decompensated congestive heart failure with cardiogenic pulmonar |
| 8 | `SPEC-CARD-01-00020` | CDV-020 | `SPEC-CARD-01-00220` | Innocent (functional) heart murmur — Still's murmur |
| 9 | `SPEC-CARD-01-00021` | CDV-021 | `SPEC-CARD-01-00221` | Ischaemic heart disease presenting as new-onset crescendo angina, susp |
| 10 | `SPEC-CARD-01-00022` | AUC-022 | `SPEC-EMG-01-00221` | Out-of-hospital cardiac arrest, shockable rhythm (presumed ventricular |
| 11 | `SPEC-CARD-01-00024` | CDV-024 | `SPEC-CARD-03-00024` | Paroxysmal supraventricular tachycardia (regular narrow-complex re-ent |
| 12 | `SPEC-CARD-01-00027` | CDV-027 | `SPEC-CARD-01-00227` | Mitral regurgitation with acute decompensated left ventricular failure |
| 13 | `SPEC-CARD-01-00028` | CDV-028 | `SPEC-CARD-03-00228` | Mitral valve prolapse (MVP syndrome), benign/stable |
| 14 | `SPEC-CARD-01-00029` | CDV-029 | `SPEC-CARD-01-00229` | Acute myocardial infarction (ST-elevation myocardial infarction / STEM |
| 15 | `SPEC-CARD-01-00031` | CDV-031 | `SPEC-CARD-01-00231` | Orthostatic hypotension, likely iatrogenic (alpha-blocker precipitated |
| 16 | `SPEC-CARD-01-00032` | CDV-032 | `SPEC-CARD-03-00232` | Acute pericarditis, post-viral |
| 17 | `SPEC-CARD-01-00036` | AUC-036 | `SPEC-CARD-01-00110` | Hypertensive emergency with hypertensive encephalopathy and acute end- |
| 18 | `SPEC-CARD-01-00037` | CDV-037 | `SPEC-CARD-04-00037` | Rheumatic heart disease with severe mitral stenosis, acute decompensat |
| 19 | `SPEC-CARD-01-00040` | CDV-040 | `SPEC-CARD-01-00240` | Stable angina pectoris (new-onset exertional angina, effort-stable pat |
| 20 | `SPEC-CARD-01-00042` | CDV-042 | `SPEC-CARD-01-00242` | Paroxysmal supraventricular tachycardia (likely AV-nodal re-entry tach |
| 21 | `SPEC-CARD-01-00043` | CDV-043 | `SPEC-CARD-01-00257` | Vasovagal (reflex) syncope with minor closed head injury |
| 22 | `SPEC-CARD-01-00047` | CDV-047 | `SPEC-CARD-01-00247` | Reflex (neurocardiogenic) faint provoked by a blood/injury/medical-pro |
| 23 | `SPEC-CARD-01-00048` | CDV-048 | `SPEC-CARD-01-00248` | Ventricular ectopic beats (premature ventricular contractions) — benig |
| 24 | `SPEC-CARD-01-00049` | CDV-049 | `SPEC-CARD-03-00249` | White coat hypertension (situational, anxiety-driven clinic blood-pres |
| 25 | `SPEC-CARD-01-00050` | CDV-050 | `SPEC-CARD-01-00250` | Wolff-Parkinson-White syndrome (suspected) presenting as paroxysmal AV |
| 26 | `SPEC-CARD-01-00099` | CDV-005 | `SPEC-CARD-01-00206` | New-onset atrial fibrillation with rapid ventricular response |
| 27 | `SPEC-CARD-02-00010` | CDV-010 | `SPEC-CARD-04-00210` | New symptomatic intraventricular conduction delay (bundle branch block |
| 28 | `SPEC-CARD-02-00019` | CDV-019 | `SPEC-CARD-01-00204` | Hypertensive urgency due to antihypertensive non-adherence (severe sym |
| 29 | `SPEC-CARD-02-00034` | CDV-034 | `SPEC-CARD-02-00234` | Postural Orthostatic Tachycardia Syndrome (POTS) |
| 30 | `SPEC-CARD-03-00023` | CFE-023 | `SPEC-RESP-03-00023` | Long COVID cardiopulmonary phenotype — acute exacerbation (post-viral  |
| 31 | `SPEC-CARD-03-00044` | CDV-044 | `SPEC-CARD-01-00244` | Sinus tachycardia secondary to excessive caffeine (energy-drink) intak |
| 32 | `SPEC-CARD-04-00003` | CDV-003 | `SPEC-CARD-01-00203` | Symptomatic severe aortic stenosis |
| 33 | `SPEC-CARD-04-00004` | CDV-004 | `SPEC-CARD-04-00204` | Arrhythmogenic right ventricular cardiomyopathy (suspected inherited c |
| 34 | `SPEC-CARD-04-00007` | CDV-007 | `SPEC-CARD-03-00207` | Symptomatic bradycardia with haemodynamic compromise, likely iatrogeni |
| 35 | `SPEC-CARD-04-00015` | CDV-015 | `SPEC-CARD-01-00216` | Infective endocarditis of the aortic valve on a native bicuspid valve, |
| 36 | `SPEC-CARD-04-00016` | CDV-016 | `SPEC-CARD-04-00216` | Suspected acute coronary syndrome (unstable angina / evolving myocardi |
| 37 | `SPEC-CARD-04-00023` | AUC-023 | `SPEC-CARD-01-00023` | Decompensated cardiac tamponade complicating viral pericarditis, with  |
| 38 | `SPEC-CARD-04-00026` | CDV-026 | `SPEC-CARD-01-00226` | Acute aortic dissection (Stanford Type A), secondary to Marfan syndrom |
| 39 | `SPEC-CARD-04-00030` | CDV-030 | `SPEC-CARD-04-00230` | Acute viral myocarditis with early left ventricular dysfunction (early |
| 40 | `SPEC-CARD-04-00035` | CDV-035 | `SPEC-CARD-01-00235` | Pulmonary hypertension with decompensated right heart failure (right v |
| 41 | `SPEC-CARD-04-00039` | CDV-039 | `SPEC-CARD-04-00239` | Sick sinus syndrome, tachycardia-bradycardia variant, exacerbated by a |
| 42 | `SPEC-CARD-04-00041` | CDV-041 | `SPEC-CARD-01-00041` | Severe statin-associated muscle symptoms with high risk of statin-indu |
| 43 | `SPEC-CARD-05-00008` | CDV-008 | `SPEC-CARD-04-00208` | Brugada syndrome (fever-triggered), presenting as aborted sudden cardi |
| 44 | `SPEC-CARD-05-00012` | CDV-012 | `SPEC-CARD-04-00212` | Suspected catecholaminergic polymorphic ventricular tachycardia (inher |
| 45 | `SPEC-CARD-05-00022` | CDV-022 | `SPEC-CARD-01-00222` | Kawasaki disease (complete, acute phase) with suspected acute cardiac  |
| 46 | `SPEC-CARD-05-00023` | CDV-023 | `SPEC-CARD-03-00223` | Congenital long QT syndrome (suspected, acoustic/startle-triggered con |
| 47 | `SPEC-CARD-05-00038` | CDV-038 | `SPEC-CARD-04-00238` | Suspected Short QT Syndrome presenting as high-risk arrhythmic syncope |
| 48 | `SPEC-DERM-01-00001` | DST-001 | `SPEC-DERM-03-00201` | Severe nodulocystic acne with acute inflammatory flare |
| 49 | `SPEC-DERM-01-00002` | CIA-002 | `SPEC-DERM-01-00202` | Acute spontaneous urticaria (likely post-viral), without angioedema or |
| 50 | `SPEC-DERM-01-00009` | DST-009 | `SPEC-DST-01-00209` | Large cervical furuncle (cutaneous abscess) with surrounding celluliti |
| 51 | `SPEC-DERM-01-00010` | DST-010 | `SPEC-DERM-01-00948` | Severe cutaneous candidal intertrigo of the inguinal and abdominal ski |
| 52 | `SPEC-DERM-01-00014` | DST-014 | `SPEC-DERM-01-00214` | Acute allergic contact dermatitis (nickel/metal-induced) of the infrau |
| 53 | `SPEC-DERM-01-00016` | CIA-016 | `SPEC-DERM-01-00216` | Recurrent herpes labialis (HSV reactivation) — severe painful exacerba |
| 54 | `SPEC-DERM-01-00018` | CIA-018 | `SPEC-DERM-01-00218` | Non-bullous impetigo of the face, extensive and rapidly spreading, agg |
| 55 | `SPEC-DERM-01-00019` | DST-019 | `SPEC-DERM-01-00951` | Widespread acute mechanical/bacterial (frictional-occlusive) folliculi |
| 56 | `SPEC-DERM-01-00020` | DST-020 | `SPEC-DERM-01-00220` | Large mature furuncle (staphylococcal skin abscess) of the posterior t |
| 57 | `SPEC-DERM-01-00021` | AUC-021 | `SPEC-EMG-01-00021` | Partial-thickness thermal flame burn of the anterior trunk and face (~ |
| 58 | `SPEC-DERM-01-00022` | CIA-022 | `SPEC-DERM-01-00258` | Large local reaction to an insect (arthropod) bite |
| 59 | `SPEC-DERM-01-00024` | CIA-024 | `SPEC-DERM-01-00224` | Atopic dermatitis (eczema) — acute flare, moderate severity |
| 60 | `SPEC-DERM-01-00025` | CIA-025 | `SPEC-DERM-01-00252` | Allergic contact dermatitis of the abdomen (nickel, from a belt buckle |
| 61 | `SPEC-DERM-01-00026` | DST-026 | `SPEC-DERM-01-00226` | Non-bullous impetigo of the perioral and perinasal face (acute exacerb |
| 62 | `SPEC-DERM-01-00027` | DST-027 | `SPEC-DERM-01-00227` | Acute flare of cutaneous and oral lichen planus with a screened-negati |
| 63 | `SPEC-DERM-01-00029` | DST-029 | `SPEC-DERM-03-00229` | Melasma (acute ultraviolet-induced exacerbation) |
| 64 | `SPEC-DERM-01-00030` | DST-030 | `SPEC-DERM-03-00230` | Inflamed molluscum contagiosum (BOTE sign - beginning-of-the-end immun |
| 65 | `SPEC-DERM-01-00031` | CIA-031 | `SPEC-DERM-01-00231` | Mild solar erythema (first-degree sunburn) |
| 66 | `SPEC-DERM-01-00032` | DST-032 | `SPEC-DERM-01-00232` | Pityriasis versicolor (tinea versicolor) — acute exacerbation |
| 67 | `SPEC-DERM-01-00033` | CIA-033 | `SPEC-DERM-01-00233` | Minor superficial (partial-thickness) friction abrasion of the right k |
| 68 | `SPEC-DERM-01-00034` | DST-034 | `SPEC-DERM-03-00200` | Papulopustular rosacea (acute severe flare) |
| 69 | `SPEC-DERM-01-00035` | DST-035 | `SPEC-DERM-01-00235` | Classic scabies (Sarcoptes scabiei var. hominis infestation), acute sy |
| 70 | `SPEC-DERM-01-00036` | CIA-036 | `SPEC-DERM-01-00236` | Pityriasis rosea |
| 71 | `SPEC-DERM-01-00037` | DST-037 | `SPEC-DERM-03-00237` | Infantile seborrhoeic dermatitis (cradle cap) with acute intertriginou |
| 72 | `SPEC-DERM-01-00039` | CIA-039 | `SPEC-DERM-03-00258` | Seborrhoeic dermatitis of the face and scalp, acute exacerbation |
| 73 | `SPEC-DERM-01-00040` | CIA-040 | `SPEC-DERM-01-00240` | Superficial bacterial folliculitis (mechanical/friction-triggered, low |
| 74 | `SPEC-DERM-01-00041` | DST-041 | `SPEC-DERM-01-00241` | Tinea corporis (dermatophytosis), steroid-modified (tinea incognito) |
| 75 | `SPEC-DERM-01-00042` | CIA-042 | `SPEC-DERM-01-00253` | Tinea corporis (dermatophytosis of the trunk, likely zoonotic) |
| 76 | `SPEC-DERM-01-00043` | CIA-043 | `SPEC-DERM-01-00243` | Tinea pedis (interdigital and moccasin-type), acutely exacerbated with |
| 77 | `SPEC-DERM-01-00044` | DST-044 | `SPEC-DERM-01-00244` | Severe interdigital tinea pedis with maceration and a deep fissure (ac |
| 78 | `SPEC-DERM-01-00045` | DST-045 | `SPEC-DERM-01-00245` | Acute inflammatory vesiculobullous tinea pedis (dermatophyte infection |
| 79 | `SPEC-DERM-01-00046` | CIA-046 | `SPEC-DERM-01-00246` | Verruca plantaris (plantar wart), symptomatic / exacerbated |
| 80 | `SPEC-DERM-01-00047` | CIA-047 | `SPEC-DERM-01-00247` | Verruca vulgaris (common viral warts, HPV-related), multiple with peri |
| 81 | `SPEC-DERM-01-00048` | DST-048 | `SPEC-DERM-01-00248` | Vitiligo (non-segmental) |
| 82 | `SPEC-DERM-01-00049` | DST-049 | `SPEC-DERM-01-00249` | Plantar wart (verruca plantaris) with acute mechanical irritation |
| 83 | `SPEC-DERM-01-00050` | DST-050 | `SPEC-DERM-01-00299` | Traumatised (partially avulsed) verruca vulgaris of the finger with ac |
| 84 | `SPEC-DERM-01-00099` | CIA-021 | `SPEC-DERM-01-00221` | Localised superficial epidermal (first-degree) thermal burn of the lef |
| 85 | `SPEC-DERM-01-00100` | DST-016 | `SPEC-DERM-03-00949` | Acute severe exacerbation of atopic dermatitis with secondary excoriat |
| 86 | `SPEC-DERM-01-00101` | DST-021 | `SPEC-DERM-01-00952` | Pediculosis capitis (head lice infestation) with secondary excoriation |
| 87 | `SPEC-DERM-01-00102` | DST-031 | `SPEC-DERM-01-00953` | Pityriasis rosea (acute eruptive phase) — benign self-limiting post-vi |
| 88 | `SPEC-DERM-01-00103` | DST-036 | `SPEC-DERM-03-00236` | Severe seborrhoeic dermatitis with acute anterior blepharitis (acute e |
| 89 | `SPEC-DERM-01-00104` | DST-042 | `SPEC-DERM-01-00956` | Tinea corporis with secondary excoriation |
| 90 | `SPEC-DERM-01-00105` | DST-043 | `SPEC-DERM-01-00957` | Tinea cruris (dermatophyte infection of the groin) with a topical-cort |
| 91 | `SPEC-DERM-01-00106` | DST-046 | `SPEC-DERM-01-00291` | Acute urticaria (hives), likely NSAID-triggered, without angioedema or |
| 92 | `SPEC-DERM-02-00007` | AMS-007 | `SPEC-DERM-03-00207` | Bullous pemphigoid, mild localised (lower limb) |
| 93 | `SPEC-DERM-03-00001` | AMS-001 | `SPEC-DERM-01-00201` | Focal patchy autoimmune non-scarring hair loss (single-patch presentat |
| 94 | `SPEC-DERM-03-00003` | DST-003 | `SPEC-DERM-03-00203` | Actinic keratosis with acute traumatic inflammation and minor haemorrh |
| 95 | `SPEC-DERM-03-00004` | DST-004 | `SPEC-DERM-01-00204` | Alopecia areata, rapidly progressive multifocal, with trichodynia and  |
| 96 | `SPEC-DERM-03-00005` | DST-005 | `SPEC-DERM-03-00205` | Acute irritant and allergic contact dermatitis of the scalp, superimpo |
| 97 | `SPEC-DERM-03-00008` | DST-008 | `SPEC-DERM-01-00208` | Nodulo-ulcerative basal cell carcinoma of the right nasal ala with acu |
| 98 | `SPEC-DERM-03-00012` | AMS-012 | `SPEC-DERM-03-00212` | Dermatitis herpetiformis (mild, localised) — exacerbation |
| 99 | `SPEC-DERM-03-00013` | DST-013 | `SPEC-DERM-01-00213` | Severe acute allergic contact dermatitis (plant/Rhus-induced) of the d |
| 100 | `SPEC-DERM-03-00015` | DST-015 | `SPEC-DERM-04-00201` | Infected neuropathic diabetic foot ulcer |
| 101 | `SPEC-DERM-03-00018` | DST-018 | `SPEC-DERM-01-00950` | Erythema multiforme minor, secondary to recent herpes simplex virus (c |
| 102 | `SPEC-DERM-03-00019` | AMS-019 | `SPEC-DERM-03-00219` | Guttate psoriasis (post-streptococcal, mild) |
| 103 | `SPEC-DERM-03-00022` | AMS-022 | `SPEC-DERM-03-00202` | Lichen planus, mild cutaneous, with acute pruritic exacerbation |
| 104 | `SPEC-DERM-03-00024` | AMS-024 | `SPEC-DERM-03-00224` | Extragenital lichen sclerosus (mild), with secondary health anxiety |
| 105 | `SPEC-DERM-03-00025` | DST-025 | `SPEC-DERM-03-00225` | Hidradenitis suppurativa (Hurley Stage II/III) — acute severe inflamma |
| 106 | `SPEC-DERM-03-00028` | DST-028 | `SPEC-DERM-01-00228` | Suspected cutaneous malignant melanoma of the upper back, ulcerated an |
| 107 | `SPEC-DERM-03-00033` | DST-033 | `SPEC-DERM-01-00954` | Severe plaque psoriasis — acute explosive exacerbation (post-streptoco |
| 108 | `SPEC-DERM-03-00035` | AMS-035 | `SPEC-DERM-03-00235` | Pemphigus foliaceus (mild superficial) — acute exacerbation |
| 109 | `SPEC-DERM-03-00038` | DST-038 | `SPEC-DERM-03-00238` | Seborrhoeic keratosis, traumatised (partial avulsion) |
| 110 | `SPEC-DERM-03-00039` | AMS-039 | `SPEC-DERM-03-00239` | Acute mechanical fissuring of neglected chronic plaque psoriasis, with |
| 111 | `SPEC-DERM-03-00040` | DST-040 | `SPEC-DERM-01-00955` | Severe inflammatory tinea capitis with acute kerion formation in a 6-y |
| 112 | `SPEC-DERM-03-00041` | AMS-041 | `SPEC-DERM-03-00241` | Chronic scalp psoriasis, mild, acutely excoriated and fissured (no sec |
| 113 | `SPEC-DERM-03-00046` | AMS-046 | `SPEC-RHEUM-03-00046` | Acute cutaneous flare of systemic lupus erythematosus (photosensitive  |
| 114 | `SPEC-DERM-03-00047` | DST-047 | `SPEC-DERM-01-00958` | Chronic venous leg ulcer with acute secondary bacterial cellulitis of  |
| 115 | `SPEC-DERM-03-00049` | AMS-049 | `SPEC-DERM-03-00249` | Mild acrofacial vitiligo with secondary acute health anxiety |
| 116 | `SPEC-DERM-03-00050` | AMS-050 | `SPEC-DERM-01-00250` | Vitiligo (mild non-segmental) with secondary acute health anxiety |
| 117 | `SPEC-DERM-03-00099` | CFE-041 | `SPEC-DERM-03-00242` | Severe plaque psoriasis, acute exacerbation, with systemic inflammator |
| 118 | `SPEC-DERM-03-00107` | DST-012 | `SPEC-DERM-01-00212` | Acute cellulitis of the right lower limb with systemic inflammatory re |
| 119 | `SPEC-DERM-03-00108` | DST-024 | `SPEC-DERM-03-00251` | Herpes zoster (thoracic, right T5-T6 dermatome) |
| 120 | `SPEC-DERM-03-00109` | DST-039 | `SPEC-DERM-01-00239` | Invasive cutaneous squamous cell carcinoma of the dorsum of the left h |
| 121 | `SPEC-DERM-04-00006` | DST-006 | `SPEC-DST-03-00206` | ACE inhibitor-induced angioedema (bradykinin-mediated), acute |
| 122 | `SPEC-DERM-04-00011` | DST-011 | `SPEC-DST-04-00211` | Severe acute pseudomembranous oropharyngeal candidiasis (oral thrush)  |
| 123 | `SPEC-DERM-04-00017` | DST-017 | `SPEC-DERM-01-00271` | Facial erysipelas (superficial cellulitis, likely Group A streptococca |
| 124 | `SPEC-DERM-04-00022` | DST-022 | `SPEC-DERM-01-00222` | Cutaneous herpes simplex virus (HSV) infection of the right infraorbit |
| 125 | `SPEC-DERM-04-00023` | DST-023 | `SPEC-DERM-04-00223` | Severe primary herpetic gingivostomatitis (first-episode oral herpes s |
| 126 | `SPEC-DERM-04-00026` | AMS-026 | `SPEC-DERM-03-00226` | Linear IgA bullous dermatosis, drug-induced (mild, localised) |
| 127 | `SPEC-DERM-05-00027` | CFE-027 | `SPEC-DERM-03-00227` | Mast cell activation syndrome, cutaneous-predominant acute flare (seve |
| 128 | `SPEC-DERM-05-00047` | CFE-047 | `SPEC-HAEMAT-05-00047` | Indolent systemic mastocytosis with an acute mast cell mediator-releas |
| 129 | `SPEC-DERM-07-00002` | DST-002 | `SPEC-DERM-07-00201` | Acne vulgaris with acute excoriation and behavioural distress |
| 130 | `SPEC-EMG-01-00037` | CIA-037 | `SPEC-ID-03-00203` | Post-viral fatigue syndrome following an uncomplicated viral upper res |
| 131 | `SPEC-EMG-01-00043` | AUC-043 | `SPEC-EMG-01-00243` | Acute opioid poisoning (mixed opioid and benzodiazepine overdose) with |
| 132 | `SPEC-ENDO-01-00027` | AUC-027 | `SPEC-ENDO-01-00227` | Diabetic ketoacidosis precipitated by intercurrent illness and omitted |
| 133 | `SPEC-ENDO-01-00035` | AUC-035 | `SPEC-ENDO-04-00035` | Hyperosmolar Hyperglycaemic State (HHS) |
| 134 | `SPEC-ENDO-03-00018` | CFE-018 | `SPEC-ENDO-03-00218` | Symptomatic Hashimoto thyroiditis flare (chronic autoimmune thyroiditi |
| 135 | `SPEC-ENDO-03-00021` | AMS-021 | `SPEC-ENDO-03-00221` | Anxiety-induced psychogenic polydipsia with mild hyperglycaemia in lat |
| 136 | `SPEC-ENDO-04-00016` | AUC-016 | `SPEC-ENDO-01-00201` | Acute adrenal (Addisonian) crisis precipitated by intercurrent illness |
| 137 | `SPEC-ENDO-04-00049` | AUC-049 | `SPEC-ENDO-05-00049` | Thyrotoxic crisis precipitated by intercurrent infection and abrupt an |
| 138 | `SPEC-GI-01-00001` | AUC-001 | `SPEC-GI-01-00201` | Acute abdomen with generalised peritonitis, suspected hollow viscus pe |
| 139 | `SPEC-GI-01-00002` | AUC-002 | `SPEC-SURG-01-00002` | Acute appendicitis (early, non-perforated) |
| 140 | `SPEC-GI-01-00004` | AUC-004 | `SPEC-SURG-01-00004` | Acute cholecystitis |
| 141 | `SPEC-GI-01-00007` | AUC-007 | `SPEC-GI-01-00200` | Acute upper gastrointestinal haemorrhage with hypovolaemic (haemorrhag |
| 142 | `SPEC-GI-01-00010` | AUC-010 | `SPEC-GI-04-00010` | Acute pancreatitis (alcohol-induced) with early hypovolaemia and SIRS  |
| 143 | `SPEC-GI-01-00013` | CIA-013 | `SPEC-GI-01-00213` | Functional constipation (acute exacerbation with significant faecal lo |
| 144 | `SPEC-GI-01-00014` | CIA-014 | `SPEC-GI-03-00214` | Gastro-oesophageal reflux disease (GORD), acute exacerbation — present |
| 145 | `SPEC-GI-01-00020` | AUC-020 | `SPEC-GI-01-00220` | Biliary colic due to symptomatic cholelithiasis |
| 146 | `SPEC-GI-01-00024` | AUC-024 | `SPEC-GI-01-00224` | Acute calculous cholecystitis |
| 147 | `SPEC-GI-01-00026` | CIA-026 | `SPEC-GI-01-00226` | Functional dyspepsia (uninvestigated, postprandial distress syndrome), |
| 148 | `SPEC-GI-01-00027` | CIA-027 | `SPEC-GI-01-00227` | Symptomatic external haemorrhoids (mild, uncomplicated) |
| 149 | `SPEC-GI-01-00033` | AUC-033 | `SPEC-GI-01-00233` | Acute upper gastrointestinal haemorrhage from an NSAID-induced bleedin |
| 150 | `SPEC-GI-01-00049` | CIA-049 | `SPEC-GI-01-00249` | Viral gastroenteritis with mild dehydration |
| 151 | `SPEC-GI-01-00099` | CIA-010 | `SPEC-DERM-01-00210` | Recurrent minor aphthous ulceration — severe painful exacerbation |
| 152 | `SPEC-GI-03-00004` | AMS-004 | `SPEC-GI-03-00204` | Somatic (functional) right-upper-quadrant discomfort on a background o |
| 153 | `SPEC-GI-03-00009` | CFE-009 | `SPEC-GI-03-00299` | Acute symptomatic coeliac disease flare (gluten-induced enteropathy) w |
| 154 | `SPEC-GI-03-00010` | AMS-010 | `SPEC-GI-03-00210` | Coeliac disease with an acute symptomatic flare following gluten (diet |
| 155 | `SPEC-GI-03-00011` | AMS-011 | `SPEC-GI-03-00211` | Crohn's disease flare — mild ileocecal (terminal ileitis) |
| 156 | `SPEC-GI-03-00014` | CFE-014 | `SPEC-GI-03-00255` | Acute oesophageal food bolus impaction on a background of eosinophilic |
| 157 | `SPEC-GI-03-00021` | CFE-021 | `SPEC-GI-03-00201` | Peripheral enteropathic arthritis with concurrent acute Crohn's diseas |
| 158 | `SPEC-GI-03-00027` | AMS-027 | `SPEC-GI-03-00227` | Acute flare of Microscopic Colitis (Mild Collagenous) |
| 159 | `SPEC-GI-03-00028` | AMS-028 | `SPEC-GI-03-00252` | Acute visceral colic with secretory watery diarrhoea in the setting of |
| 160 | `SPEC-GI-03-00047` | AMS-047 | `SPEC-GI-03-00254` | Acute flare of ulcerative proctitis (mild distal inflammatory bowel di |
| 161 | `SPEC-GI-05-00028` | CFE-028 | `SPEC-GI-03-00228` | Mast cell activation syndrome (MCAS), gastrointestinal-predominant — a |
| 162 | `SPEC-GI-06-00019` | CFE-019 | `SPEC-GI-06-00946` | Acute autonomic and visceral flare of hypermobile Ehlers-Danlos syndro |
| 163 | `SPEC-GI-06-00036` | CFE-036 | `SPEC-GI-03-00036` | Post-infectious irritable bowel syndrome with mast cell activation ove |
| 164 | `SPEC-HAEMAT-03-00006` | AMS-006 | `SPEC-HAEMAT-03-00206` | Acute somatic anxiety reaction to an abnormal pathology result, on a b |
| 165 | `SPEC-HAEMAT-04-00002` | AMS-002 | `SPEC-OBS-04-00002` | Benign musculoskeletal calf cramp in early pregnancy, on a background  |
| 166 | `SPEC-ID-01-00001` | CIA-001 | `SPEC-ENT-01-00201` | Acute diffuse otitis externa of the right ear, bacterial, severe/exace |
| 167 | `SPEC-ID-01-00026` | AUC-026 | `SPEC-OMFS-01-00026` | Acute odontogenic (periapical) dental abscess with spreading facial ce |
| 168 | `SPEC-ID-01-00028` | CIA-028 | `SPEC-ID-01-00228` | Oral candidiasis (pseudomembranous, antibiotic-associated), mild uncom |
| 169 | `SPEC-ID-01-00031` | AUC-031 | `SPEC-ENT-01-00231` | Severe active epistaxis with posterior pharyngeal flow and early hypov |
| 170 | `SPEC-ID-01-00040` | AUC-040 | `SPEC-ID-01-00240` | Acute bacterial meningitis (with risk of meningococcal septicaemia) |
| 171 | `SPEC-ID-01-00041` | AUC-041 | `SPEC-EMG-04-00041` | Necrotising fasciitis of the lower limb with septic shock |
| 172 | `SPEC-ID-01-00045` | AUC-046 | `SPEC-ID-04-00046` | Severe sepsis with septic shock, urinary source, following treatment-f |
| 173 | `SPEC-ID-01-00050` | AUC-050 | `SPEC-EMG-03-00050` | Toxic shock syndrome (staphylococcal, menstrual/tampon-associated) wit |
| 174 | `SPEC-ID-03-00004` | CFE-004 | `SPEC-ID-03-00204` | Barmah Forest virus infection with post-viral polyarthralgia |
| 175 | `SPEC-ID-03-00031` | CFE-031 | `SPEC-NEURO-03-00231` | Myalgic encephalomyelitis/chronic fatigue syndrome (post-viral, Epstei |
| 176 | `SPEC-ID-04-00001` | CFE-001 | `SPEC-RHEUM-04-00201` | Alpha-gal syndrome (mammalian meat allergy) presenting as delayed syst |
| 177 | `SPEC-MH-01-00011` | AUC-011 | `SPEC-MH-01-00211` | Acute psychotic episode with command auditory hallucinations and activ |
| 178 | `SPEC-MH-01-00044` | CIA-044 | `SPEC-MH-01-00244` | Transient (adjustment) insomnia precipitated by an acute psychosocial  |
| 179 | `SPEC-MH-03-00009` | AMS-009 | `SPEC-GI-03-00209` | Acute panic attack with hyperventilation, triggered by misinterpretati |
| 180 | `SPEC-MH-03-00014` | AMS-014 | `SPEC-MH-03-00214` | Acute health-anxiety / panic reaction triggered by misinterpreting an  |
| 181 | `SPEC-MH-03-00015` | AMS-015 | `SPEC-HAEMAT-03-00215` | Acute anxiety with hyperventilation-induced peripheral paraesthesia mi |
| 182 | `SPEC-MH-03-00017` | AMS-017 | `SPEC-ENDO-03-00217` | Globus pharyngeus with acute anxiety (panic), on a background of euthy |
| 183 | `SPEC-MH-03-00023` | AMS-023 | `SPEC-DERM-03-00223` | Reticular oral lichen planus (incidental, benign) with an acute health |
| 184 | `SPEC-MH-03-00030` | AMS-030 | `SPEC-HAEMAT-03-00230` | Acute health anxiety with panic attack and tension-type headache, trig |
| 185 | `SPEC-MH-03-00037` | AMS-037 | `SPEC-MH-03-00237` | Acute panic attack with severe health anxiety, precipitated by an inci |
| 186 | `SPEC-MH-03-00043` | AMS-043 | `SPEC-ENDO-03-00243` | Acute panic attack (acute anxiety) mimicking thyrotoxicosis, on a back |
| 187 | `SPEC-MH-03-00044` | AMS-044 | `SPEC-ENDO-03-00244` | Acute anxiety (panic) reaction triggered by misinterpreted incidental  |
| 188 | `SPEC-MH-03-00048` | AMS-048 | `SPEC-MH-03-00252` | Acute panic attack with severe health anxiety, in the setting of mild  |
| 189 | `SPEC-MSK-01-00012` | CIA-012 | `SPEC-MSK-01-00212` | Exercise-associated muscle cramp of the right medial gastrocnemius (be |
| 190 | `SPEC-MSK-01-00015` | CIA-015 | `SPEC-MSK-01-00215` | Grade 1 lateral ankle sprain (anterior talofibular ligament) |
| 191 | `SPEC-MSK-01-00025` | AUC-025 | `SPEC-MSK-04-00025` | Acute compartment syndrome of the lower leg (anterior compartment) fol |
| 192 | `SPEC-MSK-01-00029` | CIA-029 | `SPEC-MSK-01-00229` | Plantar fasciitis of the right foot (mechanical enthesopathy at the me |
| 193 | `SPEC-MSK-01-00030` | CIA-030 | `SPEC-MSK-01-00230` | Uncomplicated soft tissue contusion of the anterior thigh with intramu |
| 194 | `SPEC-MSK-01-00032` | AUC-032 | `SPEC-MSK-01-00232` | Open displaced fracture of the left tibial shaft |
| 195 | `SPEC-MSK-01-00034` | CIA-034 | `SPEC-MSK-01-00250` | Acute non-specific mechanical lower back pain with paraspinal muscle s |
| 196 | `SPEC-MSK-01-00037` | AUC-037 | `SPEC-MSK-01-00234` | Anterior glenohumeral (shoulder) dislocation with axillary nerve neuro |
| 197 | `SPEC-MSK-01-00038` | AUC-038 | `SPEC-EMG-01-00238` | Deep full-thickness laceration of the left volar forearm requiring pri |
| 198 | `SPEC-MSK-03-00002` | CFE-002 | `SPEC-RHEUM-03-00002` | Non-radiographic axial spondyloarthritis, acute flare |
| 199 | `SPEC-MSK-03-00005` | CFE-005 | `SPEC-PAIN-03-00205` | Centralised chronic low back pain (nociplastic pain) — acute-on-chroni |
| 200 | `SPEC-MSK-03-00006` | CFE-006 | `SPEC-MSK-03-00206` | Chronic low back pain with lumbosacral (L5) radiculopathy — acute radi |
| 201 | `SPEC-MSK-03-00012` | CFE-012 | `SPEC-NEURO-03-00012` | Complex Regional Pain Syndrome Type I (CRPS-I) of the upper limb — acu |
| 202 | `SPEC-MSK-03-00016` | CFE-016 | `SPEC-PAIN-03-00216` | Fibromyalgia (post-traumatic onset) — acute central-sensitisation flar |
| 203 | `SPEC-MSK-03-00017` | CFE-017 | `SPEC-RHEUM-03-00217` | Fibromyalgia (primary central sensitisation) — acute pain and cognitiv |
| 204 | `SPEC-MSK-03-00032` | CFE-032 | `SPEC-RHEUM-03-00232` | Ross River virus post-viral polyarthralgia (chronic flare) |
| 205 | `SPEC-MSK-03-00033` | CFE-033 | `SPEC-RHEUM-03-00947` | Seronegative rheumatoid arthritis (symmetrical inflammatory polyarthri |
| 206 | `SPEC-MSK-03-00034` | CFE-034 | `SPEC-RHEUM-03-00234` | Acute exacerbation of seropositive rheumatoid arthritis (symmetrical i |
| 207 | `SPEC-MSK-03-00035` | CFE-035 | `SPEC-RHEUM-03-00235` | Polymyalgia rheumatica (acute severe flare) |
| 208 | `SPEC-MSK-03-00042` | CFE-042 | `SPEC-RHEUM-03-00260` | Axial psoriatic arthritis — acute flare (psoriatic spondylitis / sacro |
| 209 | `SPEC-MSK-03-00043` | CFE-043 | `SPEC-RHEUM-03-00243` | Psoriatic arthritis (oligoarticular) — acute exacerbation with dactyli |
| 210 | `SPEC-MSK-03-00045` | CFE-045 | `SPEC-RHEUM-03-00946` | Reactive arthritis (post-Campylobacter enteric-triggered) with conjunc |
| 211 | `SPEC-MSK-06-00015` | CFE-015 | `SPEC-RHEUM-03-00215` | Acute centralised-pain flare (fibromyalgia-type) overlaying known rheu |
| 212 | `SPEC-MSK-06-00020` | CFE-020 | `SPEC-MSK-03-00220` | Hypermobile Ehlers-Danlos syndrome — musculoskeletal phenotype, acute  |
| 213 | `SPEC-MSK-06-00049` | CFE-049 | `SPEC-MSK-06-00249` | Temporomandibular disorder — acute masticatory (masseter/temporalis) m |
| 214 | `SPEC-NEURO-01-00014` | AUC-014 | `SPEC-NEURO-01-00214` | Acute ischaemic stroke — left middle cerebral artery territory, cardio |
| 215 | `SPEC-NEURO-01-00020` | CIA-020 | `SPEC-NEURO-01-00220` | Kinetosis (motion sickness) — acute severe exacerbation with intractab |
| 216 | `SPEC-NEURO-01-00030` | AUC-030 | `SPEC-NEURO-04-00030` | Lennox-Gastaut syndrome with an acute seizure cluster and impending st |
| 217 | `SPEC-NEURO-01-00041` | CIA-041 | `SPEC-NEURO-01-00241` | Tension-type headache (episodic, stress-related), exacerbated |
| 218 | `SPEC-NEURO-01-00047` | AUC-047 | `SPEC-NEURO-01-00247` | Generalised convulsive status epilepticus, precipitated by levetiracet |
| 219 | `SPEC-NEURO-01-00051` | AUC-051 | `SPEC-NEURO-01-00251` | Severe traumatic brain injury with expanding acute intracranial haemor |
| 220 | `SPEC-NEURO-03-00007` | CFE-007 | `SPEC-NEURO-03-00207` | Chronic migraine, acute severe exacerbation (status migrainosus) |
| 221 | `SPEC-NEURO-03-00011` | CFE-011 | `SPEC-NEURO-03-00211` | Complex regional pain syndrome type I (CRPS-I) of the right lower limb |
| 222 | `SPEC-NEURO-03-00024` | CFE-024 | `SPEC-CARD-03-00224` | Post-viral dysautonomia (Long COVID phenotype) with a postural orthost |
| 223 | `SPEC-NEURO-03-00025` | CFE-025 | `SPEC-ID-03-00225` | Long COVID / post-viral ME/CFS phenotype with a severe acute post-exer |
| 224 | `SPEC-NEURO-03-00026` | CFE-026 | `SPEC-NEURO-04-00201` | Long COVID neurocognitive phenotype — acute post-exertional cognitive  |
| 225 | `SPEC-NEURO-03-00030` | CFE-030 | `SPEC-NEURO-03-00230` | Myalgic encephalomyelitis / chronic fatigue syndrome (gradual idiopath |
| 226 | `SPEC-NEURO-03-00037` | CFE-037 | `SPEC-CARD-03-00237` | Postural orthostatic tachycardia syndrome, hyperadrenergic phenotype — |
| 227 | `SPEC-NEURO-03-00038` | CFE-038 | `SPEC-CARD-03-00238` | Neuropathic postural orthostatic tachycardia syndrome (POTS) with depe |
| 228 | `SPEC-NEURO-04-00008` | AMS-008 | `SPEC-NEURO-04-00208` | Clinically isolated syndrome — acute demyelinating optic neuritis (fir |
| 229 | `SPEC-NEURO-04-00010` | CFE-010 | `SPEC-NEURO-04-00210` | Coeliac disease neurological phenotype — acute gluten ataxia with peri |
| 230 | `SPEC-NEURO-05-00003` | CFE-003 | `SPEC-NEURO-05-00203` | Autoimmune autonomic failure (autoimmune dysautonomia) — acute-on-chro |
| 231 | `SPEC-NEURO-05-00029` | CFE-029 | `SPEC-NEURO-04-00029` | Mast cell activation syndrome — acute neurological flare (mast cell me |
| 232 | `SPEC-NEURO-05-00044` | CFE-044 | `SPEC-ID-03-00044` | Q fever fatigue syndrome (post-infectious/post-viral fatigue following |
| 233 | `SPEC-NEURO-05-00046` | CFE-046 | `SPEC-NEURO-03-00046` | Idiopathic small fibre neuropathy — acute painful exacerbation with au |
| 234 | `SPEC-NEURO-06-00039` | CFE-039 | `SPEC-CARD-06-00039` | Postural orthostatic tachycardia syndrome (POTS) secondary to hypermob |
| 235 | `SPEC-OBS-01-00028` | AUC-028 | `SPEC-OBS-01-00202` | Leaking / ruptured tubal ectopic pregnancy with haemoperitoneum and ea |
| 236 | `SPEC-OBS-01-00029` | AUC-029 | `SPEC-OBS-01-00110` | Ruptured ectopic pregnancy with haemoperitoneum and haemorrhagic (hypo |
| 237 | `SPEC-OBS-01-00038` | CIA-038 | `SPEC-OBS-03-00238` | Primary dysmenorrhoea (severe exacerbation) |
| 238 | `SPEC-OBS-01-00042` | AUC-042 | `SPEC-OBS-01-00242` | Ovarian torsion (left) |
| 239 | `SPEC-OBS-01-00050` | CIA-050 | `SPEC-OBS-01-00250` | Vulvovaginal candidiasis (acute, uncomplicated) |
| 240 | `SPEC-OBS-03-00013` | CFE-013 | `SPEC-OBS-03-00213` | Endometriosis-associated chronic pelvic pain flare with central sensit |
| 241 | `SPEC-OPHTH-01-00006` | AUC-006 | `SPEC-OPHTH-01-00206` | Traumatic corneal epithelial defect from high-velocity particulate inj |
| 242 | `SPEC-OPHTH-01-00007` | CIA-007 | `SPEC-OPHTH-01-00207` | Acute severe allergic (rhino)conjunctivitis |
| 243 | `SPEC-OPHTH-01-00017` | CIA-017 | `SPEC-OPHTH-01-00250` | External hordeolum (stye) |
| 244 | `SPEC-OPHTH-01-00048` | CIA-048 | `SPEC-OPHTH-01-00248` | Viral conjunctivitis (adenoviral-type), associated with recent upper r |
| 245 | `SPEC-OPHTH-04-00003` | AMS-003 | `SPEC-OPHTH-01-00203` | Acute anterior uveitis (HLA-B27 associated, mild transient), left eye |
| 246 | `SPEC-OPHTH-04-00029` | AMS-029 | `SPEC-OPHTH-03-00229` | Severe exposure keratopathy secondary to mild Graves' ophthalmopathy ( |
| 247 | `SPEC-PAEDS-01-00019` | CIA-019 | `SPEC-DERM-01-00219` | Irritant (contact) napkin dermatitis, exacerbated by a recent diarrhoe |
| 248 | `SPEC-PAEDS-01-00023` | CIA-023 | `SPEC-ENT-01-00223` | Uncomplicated acute middle-ear infection (mild), left ear |
| 249 | `SPEC-PAEDS-01-00032` | CIA-032 | `SPEC-RESP-01-00032` | Mild viral croup (acute laryngotracheobronchitis) |
| 250 | `SPEC-PAEDS-01-00035` | CIA-035 | `SPEC-DERM-01-00259` | Pediculosis capitis (active head lice infestation) |
| 251 | `SPEC-RENAL-01-00045` | AUC-045 | `SPEC-URO-01-00245` | Acute right ureteric colic secondary to an obstructing ureteric calcul |
| 252 | `SPEC-RESP-01-00003` | AUC-003 | `SPEC-RESP-03-00203` | Acute severe asthma exacerbation with reliever failure and impending r |
| 253 | `SPEC-RESP-01-00004` | CIA-004 | `SPEC-ID-01-00204` | Acute viral pharyngitis with pain-limited oral intake and mild dehydra |
| 254 | `SPEC-RESP-01-00005` | CIA-005 | `SPEC-RESP-01-00205` | Acute viral rhinopharyngitis |
| 255 | `SPEC-RESP-01-00006` | CIA-006 | `SPEC-RESP-01-00250` | Acute viral rhinosinusitis |
| 256 | `SPEC-RESP-01-00008` | CIA-008 | `SPEC-RESP-03-00208` | Allergic rhinitis, acute exacerbation (environmental dust trigger) |
| 257 | `SPEC-RESP-01-00009` | CIA-009 | `SPEC-ENT-01-00209` | Anterior epistaxis |
| 258 | `SPEC-RESP-01-00011` | CIA-011 | `SPEC-ENT-01-00211` | Cerumen impaction, right ear (acute-on-chronic, water-exacerbated hygr |
| 259 | `SPEC-RESP-01-00017` | AUC-017 | `SPEC-EMG-01-00200` | Anaphylaxis (food-triggered, peanut) with upper-airway oedema and dist |
| 260 | `SPEC-RESP-01-00034` | AUC-034 | `SPEC-EMG-01-00034` | Massive right-sided traumatic haemothorax with haemorrhagic shock foll |
| 261 | `SPEC-RESP-01-00044` | AUC-044 | `SPEC-RESP-01-00244` | Acute pulmonary embolism with right heart strain (submassive / interme |
| 262 | `SPEC-RESP-01-00048` | AUC-048 | `SPEC-EMG-01-00248` | Right traumatic tension pneumothorax with obstructive shock |
| 263 | `SPEC-RESP-01-00099` | CIA-003 | `SPEC-ENT-01-00203` | Acute viral laryngitis |
| 264 | `SPEC-RESP-04-00013` | AUC-013 | `SPEC-RESP-04-00113` | Acute non-cardiogenic pulmonary oedema (early acute respiratory distre |
| 265 | `SPEC-RESP-04-00016` | AMS-016 | `SPEC-RESP-04-00216` | Acute asthma exacerbation in prodromal eosinophilic granulomatosis wit |
| 266 | `SPEC-RHEUM-03-00005` | AMS-005 | `SPEC-RHEUM-02-00205` | Behcet disease (mild mucocutaneous subtype), acute oral aphthous ulcer |
| 267 | `SPEC-RHEUM-03-00031` | AMS-031 | `SPEC-RHEUM-03-00231` | Acute mechanical overuse flare of mild seronegative inflammatory (rheu |
| 268 | `SPEC-RHEUM-03-00033` | AMS-033 | `SPEC-RHEUM-03-00253` | Acute flare of mixed connective tissue disease (anti-U1 RNP overlap sy |
| 269 | `SPEC-RHEUM-03-00034` | AMS-034 | `SPEC-RHEUM-03-00252` | Acute sacroiliac / paraspinal inflammatory muscle spasm — flare of kno |
| 270 | `SPEC-RHEUM-03-00036` | AMS-036 | `SPEC-RHEUM-02-00236` | Acute flare of polymyalgia rheumatica (mild, atypical acute presentati |
| 271 | `SPEC-RHEUM-03-00038` | AMS-038 | `SPEC-RHEUM-03-00238` | Acute symptomatic xerostomia flare in primary Sjögren's syndrome (mild |
| 272 | `SPEC-RHEUM-03-00040` | CFE-040 | `SPEC-RHEUM-03-00299` | Primary Sjögren syndrome with acute severe sicca and systemic flare (a |
| 273 | `SPEC-RHEUM-03-00042` | AMS-042 | `SPEC-RHEUM-03-00242` | Acute symptomatic xerostomia flare with dry-mucosa food adherence, in  |
| 274 | `SPEC-RHEUM-03-00045` | AMS-045 | `SPEC-RHEUM-03-00245` | Acute articular and constitutional flare of systemic lupus erythematos |
| 275 | `SPEC-RHEUM-03-00048` | CFE-048 | `SPEC-RHEUM-03-00248` | Acute flare of systemic lupus erythematosus (mucocutaneous and articul |
| 276 | `SPEC-RHEUM-04-00013` | AMS-013 | `SPEC-RHEUM-03-00213` | Drug-induced lupus erythematosus (hydralazine-induced), mild transient |
| 277 | `SPEC-RHEUM-04-00018` | AMS-018 | `SPEC-RHEUM-03-00218` | Tension-type headache with health anxiety in an older adult, presentin |
| 278 | `SPEC-RHEUM-04-00020` | AMS-020 | `SPEC-RHEUM-03-00220` | IgA vasculitis (Henoch-Schonlein purpura), mild adult cutaneous form,  |
| 279 | `SPEC-RHEUM-04-00025` | AMS-025 | `SPEC-RHEUM-04-00225` | Severe prolonged Raynaud's phenomenon attack (secondary), on a backgro |
| 280 | `SPEC-RHEUM-04-00032` | AMS-032 | `SPEC-RHEUM-03-00032` | Acute palindromic rheumatism flare (mild seropositive rheumatoid arthr |
| 281 | `SPEC-RHEUM-04-00040` | AMS-040 | `SPEC-RHEUM-03-00240` | Acute flare of relapsing polychondritis (mild auricular chondritis) |
| 282 | `SPEC-RHEUM-05-00050` | CFE-050 | `SPEC-RHEUM-03-00250` | Undifferentiated connective tissue disease (UCTD) flare with severe co |
| 283 | `SPEC-SURG-01-00039` | AUC-039 | `SPEC-EMG-01-00239` | Catastrophic multi-system major trauma from a high-energy motor vehicl |
| 284 | `SPEC-URO-01-00015` | AUC-015 | `SPEC-URO-01-00215` | Acute urinary retention secondary to benign prostatic hyperplasia, pre |
| 285 | `SPEC-URO-01-00045` | CIA-045 | `SPEC-URO-01-00945` | Uncomplicated acute bacterial lower urinary tract infection of the bla |
| 286 | `SPEC-URO-03-00008` | CFE-008 | `SPEC-URO-03-00208` | Chronic pelvic pain syndrome (male) / chronic non-bacterial prostatiti |
| 287 | `SPEC-URO-03-00022` | CFE-022 | `SPEC-URO-03-00946` | Interstitial cystitis / bladder pain syndrome (acute pain exacerbation |
| 288 | `SPEC-VASC-01-00001` | CDV-001 | `SPEC-VASC-01-00201` | Symptomatic abdominal aortic aneurysm (suspected rapidly expanding, at |
| 289 | `SPEC-VASC-01-00008` | AUC-008 | `SPEC-VASC-01-00208` | Acute upper limb ischaemia due to cardiogenic brachial artery embolism |
| 290 | `SPEC-VASC-01-00009` | AUC-009 | `SPEC-VASC-01-00209` | Acute lower limb ischaemia of the left leg (likely in-situ arterial th |
| 291 | `SPEC-VASC-01-00014` | CDV-014 | `SPEC-VASC-01-00214` | Deep vein thrombosis of the right lower limb (provoked, long-haul-flig |
| 292 | `SPEC-VASC-01-00018` | AUC-018 | `SPEC-CARD-03-00018` | Acute aortic dissection, Stanford Type A (ascending) |
| 293 | `SPEC-VASC-01-00019` | AUC-019 | `SPEC-VASC-04-00219` | Aortic dissection, descending (Stanford Type B), with lower-limb malpe |
| 294 | `SPEC-VASC-02-00009` | CDV-009 | `SPEC-VASC-05-00209` | Thromboangiitis obliterans (Buerger's disease) with critical limb isch |
| 295 | `SPEC-VASC-02-00018` | CDV-018 | `SPEC-VASC-03-00018` | Symptomatic peripheral arterial disease (intermittent claudication) du |
| 296 | `SPEC-VASC-02-00025` | CDV-025 | `SPEC-VASC-01-00225` | Acute bacterial cellulitis of the right lower limb superimposed on chr |
| 297 | `SPEC-VASC-02-00045` | CDV-045 | `SPEC-VASC-03-00245` | Superficial thrombophlebitis complicating pre-existing lower-limb vari |
| 298 | `SPEC-VASC-03-00036` | CDV-036 | `SPEC-VASC-03-00236` | Raynaud's phenomenon, acute vasospastic attack (beta-blocker exacerbat |
| 299 | `SPEC-VASC-04-00007` | DST-007 | `SPEC-DERM-04-00207` | Chronic limb-threatening ischaemia (critical limb ischaemia) with an a |
| 300 | `SPEC-VASC-04-00033` | CDV-033 | `SPEC-VASC-01-00233` | Chronic limb-threatening ischaemia (critical limb ischaemia) of the ri |
| 301 | `SPEC-VASC-04-00046` | CDV-046 | `SPEC-RHEUM-01-00246` | Giant cell arteritis (temporal arteritis) |
