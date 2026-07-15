/**
 * positional-stability — permute the packet, re-run, compare the ranking (M3).
 *
 * OPERATOR, 2026-07-15: *"Positional bias. Present a model with a differential list and it does not
 * weight the items purely on clinical merit. It systematically over-favours the first and/or last item
 * (primacy/recency in the token sequence, driven by attention geometry, not by memory)… the order in
 * which you list your differentials in the prompt can change the model's ranked output — a failure mode
 * with no bedside equivalent and one that is invisible unless you deliberately permute the input and
 * check for stability."*
 *
 * THIS IS THE GLITCH NO CLINICIAN WILL CATCH. A human reading a differential applies judgement to each
 * entry roughly independently of ordinal position. A transformer does not: attention is finite and
 * unevenly distributed, so the first and last items of a list are attended to more reliably than the
 * middle ("lost in the middle"). A reviewer has no intuition for this because they do not have the bug.
 * It is silent by construction — the only way to see it is to permute the input and look.
 *
 * ══ THE METHODOLOGICAL TRAP, AND WHY THE CONTROL RUN IS NOT OPTIONAL ══
 *
 * You cannot attribute an output difference to POSITION unless you have first established that the
 * generator is DETERMINISTIC. A model at temperature > 0 varies run-to-run for reasons that have
 * nothing to do with ordering; comparing a permuted run against a single baseline would attribute that
 * natural variance to positional bias and cry wolf on every check.
 *
 * So: CONTROL FIRST. Run the identical packet twice. If the outputs differ, the generator is
 * non-deterministic and this harness REFUSES TO JUDGE — it reports `verdict: "indeterminate"` rather
 * than guessing. An honest "I cannot tell you" beats a confident wrong attribution, and a
 * position-bias flag that fires on temperature noise would be switched off within a week.
 *
 * ══ WHAT IS COMPARED ══
 *
 * The RANKING, not the prose. Two runs of the same model will word things differently while ranking
 * identically; that is not instability. `rank` extracts the ordered signal that matters (by default:
 * the order in which fact ids appear in the output). If the ranking moves when only the INPUT ORDER
 * moved, the ranking was positional, not clinical.
 *
 * ══ SCOPE, HONESTLY ══
 *
 * The default trunk generator is a fixed string that ignores the packet, so it is trivially stable and
 * checking it proves nothing. This harness is for the REAL generation path (`generate_candidate(packet)`
 * — Claude / MedGemma), and is inert until one is wired. It is built now, with its detection proven
 * against a deliberately position-sensitive generator, so that the day a model is in the loop the check
 * already exists rather than being retrofitted after the first unstable ranking ships.
 *
 * Pure and deterministic: the shuffle is seeded, so a flagged instability is reproducible.
 */

/** Deterministic shuffle (mulberry32 + Fisher-Yates). Seeded so a flag can be reproduced exactly. */
function seededShuffle(arr, seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The default ranking signal: the order in which the packet's fact ids appear in the output text.
 * A model that ranks on clinical merit produces the same order regardless of input order; a model
 * riding attention geometry does not.
 */
export function defaultRank(output, packet) {
  const text = String(output ?? "");
  return (packet.facts || [])
    .map((f) => ({ id: f.fact_id, at: text.indexOf(String(f.fact_id)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.id);
}

/**
 * Check whether a generator's ranking survives permutation of the packet's lists.
 *
 * @param {object} packet - a ContextPacket
 * @param {(p: object) => Promise<string|{candidate_output: string}>} generate - packet-only generator
 * @param {{ permutations?: number, rank?: (out: string, packet: object) => string[], seed?: number }} opts
 * @returns {Promise<{verdict: "stable"|"unstable"|"indeterminate"|"not_applicable", reason: string,
 *   baseline_ranking?: string[], permuted_rankings?: string[][], permutations?: number}>}
 */
export async function checkPositionalStability(packet, generate, { permutations = 3, rank = defaultRank, seed = 0x5eed } = {}) {
  const text = async (p) => {
    const g = await generate(p);
    return typeof g === "string" ? g : String(g?.candidate_output ?? "");
  };

  const lists = ["facts", "evidence"].filter((k) => Array.isArray(packet[k]) && packet[k].length > 1);
  if (!lists.length) {
    // Nothing to permute. Not a pass — there was no question to ask.
    return { verdict: "not_applicable", reason: "the packet carries no list of length > 1; positional bias needs an ordering to bite on" };
  }

  // ── CONTROL: is the generator even deterministic? Without this, natural variance would be
  //    misattributed to position and the check would cry wolf until someone switched it off.
  const a = await text(packet);
  const b = await text(packet);
  if (rank(a, packet).join("|") !== rank(b, packet).join("|")) {
    return {
      verdict: "indeterminate",
      reason: "the generator is NOT deterministic — the identical packet produced two different rankings. Positional bias cannot be attributed until run-to-run variance is controlled (temperature 0, or aggregate over more samples). Refusing to judge rather than guess.",
    };
  }

  const baseline = rank(a, packet);
  const permuted_rankings = [];
  for (let i = 0; i < permutations; i++) {
    const p = { ...packet };
    for (const k of lists) p[k] = seededShuffle(packet[k], seed + i);
    permuted_rankings.push(rank(await text(p), p));
  }

  const unstable = permuted_rankings.filter((r) => r.join("|") !== baseline.join("|"));
  if (unstable.length) {
    return {
      verdict: "unstable",
      reason: `the ranking MOVED when only the input ORDER moved (${unstable.length}/${permutations} permutations). The ranking is positional, not clinical — the model is riding attention geometry (primacy/recency), not merit. This has no bedside equivalent: a clinician reading the same list would not do this, so no human reviewer will catch it.`,
      baseline_ranking: baseline,
      permuted_rankings,
      permutations,
    };
  }
  return { verdict: "stable", reason: `the ranking survived ${permutations} permutations of ${lists.join(" + ")}`, baseline_ranking: baseline, permutations };
}
